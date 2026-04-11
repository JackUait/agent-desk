package agent_test

import (
	"fmt"
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

// hangBin returns the path to a script that hangs until killed (ignores all args).
// It writes the script to a temp file and marks it executable.
func hangBin(t *testing.T) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "hang-*.sh")
	if err != nil {
		t.Fatalf("hangBin: create temp: %v", err)
	}
	fmt.Fprintln(f, "#!/bin/sh")
	fmt.Fprintln(f, "exec sleep 60")
	f.Close()
	if err := os.Chmod(f.Name(), 0o755); err != nil {
		t.Fatalf("hangBin: chmod: %v", err)
	}
	// Verify /bin/sh is available (it always is on macOS/Linux).
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skipf("hangBin: sh not found: %v", err)
	}
	return f.Name()
}

// TestManager_SpawnAndRead spawns a real process (using "echo" as claudeBin) and
// verifies the manager records it as running or has already exited cleanly.
func TestManager_SpawnAndRead(t *testing.T) {
	m := agent.NewManager("echo")
	events := make(chan agent.StreamEvent, 8)

	if err := m.Spawn("card-1", "", events); err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	// Give the process a moment to register
	time.Sleep(20 * time.Millisecond)

	if !m.IsRunning("card-1") && !m.HasExited("card-1") {
		t.Error("expected card-1 to be running or already exited")
	}
}

// TestManager_Kill spawns a long-running process, kills it, and verifies it is
// no longer running.
func TestManager_Kill(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Spawn("card-2", "", events); err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	if !m.IsRunning("card-2") {
		t.Fatal("expected card-2 to be running before kill")
	}

	if err := m.Kill("card-2"); err != nil {
		t.Fatalf("Kill: %v", err)
	}

	// After kill the process should be gone from procs
	time.Sleep(50 * time.Millisecond)
	if m.IsRunning("card-2") {
		t.Error("expected card-2 to not be running after kill")
	}
}

// TestManager_SpawnDuplicate verifies that spawning a card that is already
// running returns an error.
func TestManager_SpawnDuplicate(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Spawn("card-3", "", events); err != nil {
		t.Fatalf("first Spawn: %v", err)
	}
	defer m.Kill("card-3") //nolint:errcheck

	err := m.Spawn("card-3", "", make(chan agent.StreamEvent, 8))
	if err == nil {
		t.Error("expected error on duplicate Spawn, got nil")
	}
}

// TestManager_KillNotFound verifies that killing a nonexistent card returns an error.
func TestManager_KillNotFound(t *testing.T) {
	m := agent.NewManager("echo")
	err := m.Kill("nonexistent")
	if err == nil {
		t.Error("expected error killing nonexistent card, got nil")
	}
}
