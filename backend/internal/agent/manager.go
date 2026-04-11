package agent

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"sync"
)

const agentSystemPrompt = `You are an AI agent working on a kanban card task.
During the Backlog phase: Help the user define the task. Ask clarifying questions.
When the user clicks Start Development: Create a git worktree and begin implementing following TDD.
When your implementation is complete: Output exactly READY_FOR_REVIEW on its own line.
If the user rejects during Review: Read their feedback, continue working, signal READY_FOR_REVIEW again.
When the user clicks Approve: Run 'gh pr create' and output the PR URL.`

type processEntry struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
}

// Manager owns one Claude CLI process per card.
type Manager struct {
	claudeBin string
	mu        sync.RWMutex
	procs     map[string]*processEntry
	exited    map[string]bool
}

// NewManager returns a Manager that will launch claudeBin as the Claude CLI binary.
func NewManager(claudeBin string) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		procs:     make(map[string]*processEntry),
		exited:    make(map[string]bool),
	}
}

// Spawn starts a Claude CLI process for cardID. If sessionID is non-empty,
// --resume sessionID is appended. Events parsed from stdout are sent to the
// events channel; the channel is closed when the process exits.
func (m *Manager) Spawn(cardID string, sessionID string, events chan<- StreamEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, running := m.procs[cardID]; running {
		return fmt.Errorf("agent: process already running for card %q", cardID)
	}

	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--append-system-prompt", agentSystemPrompt,
	}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}

	cmd := exec.Command(m.claudeBin, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("agent: stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return fmt.Errorf("agent: stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdin.Close()
		return fmt.Errorf("agent: start process: %w", err)
	}

	m.procs[cardID] = &processEntry{cmd: cmd, stdin: stdin}

	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			ev, err := ParseStreamEvent(line)
			if err == nil {
				events <- ev
			}
		}

		// Wait for process to fully exit before cleanup.
		cmd.Wait() //nolint:errcheck

		m.mu.Lock()
		delete(m.procs, cardID)
		m.exited[cardID] = true
		m.mu.Unlock()

		close(events)
	}()

	return nil
}

// Send writes a message followed by a newline to the process's stdin.
func (m *Manager) Send(cardID string, message string) error {
	m.mu.RLock()
	entry, ok := m.procs[cardID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("agent: no running process for card %q", cardID)
	}

	_, err := fmt.Fprintf(entry.stdin, "%s\n", message)
	return err
}

// Kill closes stdin and sends SIGKILL to the process.
func (m *Manager) Kill(cardID string) error {
	m.mu.Lock()
	entry, ok := m.procs[cardID]
	m.mu.Unlock()

	if !ok {
		return fmt.Errorf("agent: no running process for card %q", cardID)
	}

	entry.stdin.Close()
	return entry.cmd.Process.Kill()
}

// IsRunning reports whether a process for cardID is currently active.
func (m *Manager) IsRunning(cardID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.procs[cardID]
	return ok
}

// HasExited reports whether a process for cardID has previously exited.
func (m *Manager) HasExited(cardID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.exited[cardID]
}
