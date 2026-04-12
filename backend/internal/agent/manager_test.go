package agent_test

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

// hangBin creates a script that ignores all args and sleeps.
func hangBin(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "hang-*.sh")
	if err != nil {
		t.Fatalf("hangBin: %v", err)
	}
	fmt.Fprintln(f, "#!/bin/sh")
	fmt.Fprintln(f, "exec sleep 60")
	f.Close()
	os.Chmod(f.Name(), 0o755)
	return f.Name()
}

// echoBin creates a script that ignores all args and outputs nothing (exits immediately).
func echoBin(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "echo-*.sh")
	if err != nil {
		t.Fatalf("echoBin: %v", err)
	}
	fmt.Fprintln(f, "#!/bin/sh")
	fmt.Fprintln(f, "exit 0")
	f.Close()
	os.Chmod(f.Name(), 0o755)
	return f.Name()
}

// TestManager_SendAndRead sends a message using a quick-exit binary
// and verifies the process completes.
func TestManager_SendAndRead(t *testing.T) {
	m := agent.NewManager(echoBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send("card-1", "", "hello", events); err != nil {
		t.Fatalf("Send: %v", err)
	}

	// Drain events until channel is closed.
	for range events {
	}

	if m.IsRunning("card-1") {
		t.Error("expected card-1 to not be running after process exits")
	}
}

// TestManager_SendDuplicate verifies that sending to a card with an active
// process returns an error.
func TestManager_SendDuplicate(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send("card-2", "", "hello", events); err != nil {
		t.Fatalf("first Send: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	err := m.Send("card-2", "", "hello", make(chan agent.StreamEvent, 8))
	if err == nil {
		t.Error("expected error on duplicate Send, got nil")
	}
}

// TestManager_IsRunning verifies a process is tracked while active.
func TestManager_IsRunning(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send("card-3", "", "hello", events); err != nil {
		t.Fatalf("Send: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	if !m.IsRunning("card-3") {
		t.Error("expected card-3 to be running")
	}
}
