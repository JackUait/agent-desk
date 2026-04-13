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

// Manager spawns one Claude CLI process per message (print mode + resume).
type Manager struct {
	claudeBin string
	mu        sync.Mutex
	running   map[string]bool // true while a process is active for a card
}

// NewManager returns a Manager that will launch claudeBin as the Claude CLI binary.
func NewManager(claudeBin string) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		running:   make(map[string]bool),
	}
}

// Send spawns a Claude CLI process in print mode for cardID, sends message as
// the prompt, and streams parsed events to the events channel. If sessionID is
// non-empty, --resume is used to continue the conversation. The channel is
// closed when the process exits.
func (m *Manager) Send(cardID string, sessionID string, message string, events chan<- StreamEvent) error {
	m.mu.Lock()
	if m.running[cardID] {
		m.mu.Unlock()
		return fmt.Errorf("agent: process already running for card %q", cardID)
	}
	m.running[cardID] = true
	m.mu.Unlock()

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
	args = append(args, message)

	cmd := exec.Command(m.claudeBin, args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.mu.Lock()
		delete(m.running, cardID)
		m.mu.Unlock()
		return fmt.Errorf("agent: stdout pipe: %w", err)
	}

	// Capture stderr for diagnostics.
	var stderrBuf strings.Builder
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		m.mu.Lock()
		delete(m.running, cardID)
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
		delete(m.running, cardID)
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
