package agent_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

// spyBin creates a script that records its argv (one arg per line) to
// argvFile and exits 0 with no output.
func spyBin(t *testing.T, argvFile string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "spy.sh")
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s\\n' \"$@\" > %q\nexit 0\n", argvFile)
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("spyBin write: %v", err)
	}
	return path
}

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

// TestManager_Send_IncludesPartialMessagesFlag verifies that Send passes
// --include-partial-messages (and the other required flags) to the Claude CLI
// so the process emits partial-message stream events.
func TestManager_Send_IncludesPartialMessagesFlag(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	bin := spyBin(t, argvFile)

	m := agent.NewManager(bin)
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send("card-flag", "", "hello world", events); err != nil {
		t.Fatalf("Send: %v", err)
	}

	// Drain until channel closes (process exits immediately).
	for range events {
	}

	raw, err := os.ReadFile(argvFile)
	if err != nil {
		t.Fatalf("read argv file: %v", err)
	}
	argv := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")

	contains := func(want string) bool {
		for _, a := range argv {
			if a == want {
				return true
			}
		}
		return false
	}

	if !contains("--include-partial-messages") {
		t.Errorf("argv missing --include-partial-messages; got %v", argv)
	}

	for _, want := range []string{
		"-p",
		"--verbose",
		"--output-format",
		"--append-system-prompt",
		"hello world",
	} {
		if !contains(want) {
			t.Errorf("argv missing %q; got %v", want, argv)
		}
	}

	// --output-format must be immediately followed by stream-json.
	foundOF := false
	for i, a := range argv {
		if a == "--output-format" {
			foundOF = true
			if i+1 >= len(argv) || argv[i+1] != "stream-json" {
				t.Errorf("--output-format not followed by stream-json; got %v", argv)
			}
			break
		}
	}
	if !foundOF {
		t.Errorf("argv missing --output-format; got %v", argv)
	}

	// Prompt must be the final positional argument.
	if len(argv) == 0 || argv[len(argv)-1] != "hello world" {
		t.Errorf("expected prompt 'hello world' as final arg; got %v", argv)
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
