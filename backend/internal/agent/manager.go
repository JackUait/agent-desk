package agent

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

const agentSystemPrompt = `You are an AI agent working on a kanban card task.
You are scoped to a single card for this entire conversation. Every mcp__agent_desk__* tool operates on that card automatically — never ask the user which card; never pass a card id. Use mcp__agent_desk__get_card to read current state, and use the set_title/set_description/set_summary/set_status/set_complexity/set_progress/set_blocked/add_label/add_acceptance_criterion/set_acceptance_criteria/set_relevant_files tools to mutate it. Prefer these tools over asking the user to edit fields manually.
ALWAYS keep the card title and description reflecting the task as a human-readable user story so anyone glancing at the card understands what is going on. The title is a one-line headline; the description is the narrative (who/what/why, referencing acceptance criteria when they exist — the ACs themselves live in the ` + "`mcp__agent_desk__set_acceptance_criteria`" + ` tool, not inline in the description). Update the card via ` + "`mcp__agent_desk__set_title`" + ` and ` + "`mcp__agent_desk__set_description`" + ` at every meaningful turn. During Backlog, update incrementally as facts are confirmed; do not fabricate acceptance criteria before the user provides them.
During the Backlog phase: Help the user define the task. Ask clarifying questions.
When the user clicks Start Development: Create a git worktree and begin implementing following TDD.
When your implementation is complete: Output exactly READY_FOR_REVIEW on its own line.
If the user rejects during Review: Read their feedback, continue working, signal READY_FOR_REVIEW again.
When the user clicks Approve: Run 'gh pr create' and output the PR URL.`

// commandBuilder lets tests inject a stub for the *exec.Cmd factory.
type commandBuilder func(bin string, args []string, dir string) *exec.Cmd

func defaultBuilder(bin string, args []string, dir string) *exec.Cmd {
	cmd := exec.Command(bin, args...)
	cmd.Dir = dir
	return cmd
}

// Manager spawns one Claude CLI process per message (print mode + resume).
type Manager struct {
	claudeBin string
	builder   commandBuilder
	mu        sync.Mutex
	running   map[string]*exec.Cmd // non-nil while a process is active for a card
}

// NewManager returns a Manager that will launch claudeBin as the Claude CLI binary.
func NewManager(claudeBin string) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		builder:   defaultBuilder,
		running:   make(map[string]*exec.Cmd),
	}
}

// NewManagerWithBuilder is for tests that need to intercept the command.
func NewManagerWithBuilder(claudeBin string, builder commandBuilder) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		builder:   builder,
		running:   make(map[string]*exec.Cmd),
	}
}

// buildArgs assembles the Claude CLI argv for a given session/model/effort/message.
// Non-empty sessionID appends --resume <id>; non-empty model appends
// --model <id>; non-empty effort appends --effort <level>; non-empty
// mcpConfigPath appends --mcp-config <path> --allowed-tools mcp__agent_desk__*.
// The prompt is always the final positional argument. Order: --model before
// --effort before prompt.
func buildArgs(sessionID, model, effort, message, mcpConfigPath string) []string {
	args := []string{
		"-p",
		"--verbose",
		"--output-format", "stream-json",
		"--include-partial-messages",
		"--append-system-prompt", agentSystemPrompt,
	}
	if mcpConfigPath != "" {
		args = append(args, "--mcp-config", mcpConfigPath, "--allowed-tools", "mcp__agent_desk__*")
	}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if effort != "" {
		args = append(args, "--effort", effort)
	}
	args = append(args, message)
	return args
}

// SendRequest carries all inputs for a single agent turn.
type SendRequest struct {
	CardID        string
	SessionID     string
	Model         string
	Effort        string
	Message       string
	WorkDir       string // absolute path to the project repo
	McpConfigPath string // absolute path to a temp .mcp.json, or "" for none
}

// Send spawns a Claude CLI process in print mode for req.CardID in req.WorkDir
// and streams parsed events to the events channel. If req.SessionID is
// non-empty, --resume is used to continue the conversation. If req.Model is
// non-empty, --model <id> is added before the positional prompt. If
// req.Effort is non-empty, --effort <level> is added after --model and
// before the positional prompt. The channel is closed when the process
// exits. An empty WorkDir is allowed and means "inherit server cwd" — useful
// for tests.
func (m *Manager) Send(req SendRequest, events chan<- StreamEvent) error {
	m.mu.Lock()
	if _, ok := m.running[req.CardID]; ok {
		m.mu.Unlock()
		return fmt.Errorf("agent: process already running for card %q", req.CardID)
	}
	m.mu.Unlock()

	args := buildArgs(req.SessionID, req.Model, req.Effort, req.Message, req.McpConfigPath)
	cmd := m.builder(m.claudeBin, args, req.WorkDir)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("agent: stdout pipe: %w", err)
	}

	// Capture stderr for diagnostics.
	var stderrBuf strings.Builder
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("agent: start process: %w", err)
	}

	m.mu.Lock()
	m.running[req.CardID] = cmd
	m.mu.Unlock()

	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			ev, parseErr := ParseStreamEvent(line)
			if parseErr == nil {
				events <- ev
			}
		}

		cmd.Wait() //nolint:errcheck

		m.mu.Lock()
		delete(m.running, req.CardID)
		m.mu.Unlock()

		close(events)
	}()

	return nil
}

// Kill terminates any running process for cardID. Safe to call with no
// active process — the call returns nil in that case.
func (m *Manager) Kill(cardID string) error {
	m.mu.Lock()
	cmd, ok := m.running[cardID]
	m.mu.Unlock()
	if !ok || cmd == nil || cmd.Process == nil {
		return nil
	}
	if err := cmd.Process.Kill(); err != nil {
		return fmt.Errorf("agent: kill card %q: %w", cardID, err)
	}
	return nil
}

// IsRunning reports whether a process for cardID is currently active.
func (m *Manager) IsRunning(cardID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.running[cardID]
	return ok
}
