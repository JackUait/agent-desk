package agent

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

const agentSystemPrompt = `You are an AI agent working on a kanban card task.
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
	running   map[string]bool // true while a process is active for a card
}

// NewManager returns a Manager that will launch claudeBin as the Claude CLI binary.
func NewManager(claudeBin string) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		builder:   defaultBuilder,
		running:   make(map[string]bool),
	}
}

// NewManagerWithBuilder is for tests that need to intercept the command.
func NewManagerWithBuilder(claudeBin string, builder commandBuilder) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		builder:   builder,
		running:   make(map[string]bool),
	}
}

// buildArgs assembles the Claude CLI argv for a given session/model/message.
// Non-empty sessionID appends --resume <id>; non-empty model appends
// --model <id>. The prompt is always the final positional argument.
func buildArgs(sessionID, model, message string) []string {
	args := []string{
		"-p",
		"--verbose",
		"--output-format", "stream-json",
		"--include-partial-messages",
		"--append-system-prompt", agentSystemPrompt,
	}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	args = append(args, message)
	return args
}

// SendRequest carries all inputs for a single agent turn.
type SendRequest struct {
	CardID    string
	SessionID string
	Model     string
	Message   string
	WorkDir   string // absolute path to the project repo
}

// Send spawns a Claude CLI process in print mode for req.CardID in req.WorkDir
// and streams parsed events to the events channel. If req.SessionID is
// non-empty, --resume is used to continue the conversation. If req.Model is
// non-empty, --model <id> is added before the positional prompt. The channel
// is closed when the process exits. An empty WorkDir is allowed and means
// "inherit server cwd" — useful for tests.
func (m *Manager) Send(req SendRequest, events chan<- StreamEvent) error {
	m.mu.Lock()
	if m.running[req.CardID] {
		m.mu.Unlock()
		return fmt.Errorf("agent: process already running for card %q", req.CardID)
	}
	m.running[req.CardID] = true
	m.mu.Unlock()

	args := buildArgs(req.SessionID, req.Model, req.Message)
	cmd := m.builder(m.claudeBin, args, req.WorkDir)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.mu.Lock()
		delete(m.running, req.CardID)
		m.mu.Unlock()
		return fmt.Errorf("agent: stdout pipe: %w", err)
	}

	// Capture stderr for diagnostics.
	var stderrBuf strings.Builder
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		m.mu.Lock()
		delete(m.running, req.CardID)
		m.mu.Unlock()
		return fmt.Errorf("agent: start process: %w", err)
	}

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

// Kill terminates any running process for cardID.
func (m *Manager) Kill(cardID string) error {
	// In per-message mode, the process is short-lived. Best-effort no-op.
	return nil
}

// IsRunning reports whether a process for cardID is currently active.
func (m *Manager) IsRunning(cardID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running[cardID]
}
