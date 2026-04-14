package agent_test

import (
	"fmt"
	"os"
	"os/exec"
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

	if err := m.Send(agent.SendRequest{CardID: "card-1", Message: "hello", WorkDir: ""}, events); err != nil {
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

	if err := m.Send(agent.SendRequest{CardID: "card-2", Message: "hello", WorkDir: ""}, events); err != nil {
		t.Fatalf("first Send: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	err := m.Send(agent.SendRequest{CardID: "card-2", Message: "hello", WorkDir: ""}, make(chan agent.StreamEvent, 8))
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

	if err := m.Send(agent.SendRequest{CardID: "card-flag", Message: "hello world", WorkDir: ""}, events); err != nil {
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

// TestManager_Send_WithModel verifies that a non-empty model is inserted
// as --model <id> before the positional prompt.
func TestManager_Send_WithModel(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	bin := spyBin(t, argvFile)

	m := agent.NewManager(bin)
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send(agent.SendRequest{CardID: "card-model", Model: "claude-sonnet-4-6", Message: "hello", WorkDir: ""}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	for range events {
	}

	raw, err := os.ReadFile(argvFile)
	if err != nil {
		t.Fatalf("read argv file: %v", err)
	}
	argv := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")

	// --model must appear followed by the model id, and the prompt must
	// still be the final positional argument.
	foundModel := false
	for i, a := range argv {
		if a == "--model" {
			foundModel = true
			if i+1 >= len(argv) || argv[i+1] != "claude-sonnet-4-6" {
				t.Errorf("--model not followed by claude-sonnet-4-6; got %v", argv)
			}
			break
		}
	}
	if !foundModel {
		t.Errorf("argv missing --model; got %v", argv)
	}
	if argv[len(argv)-1] != "hello" {
		t.Errorf("expected prompt 'hello' as final arg; got %v", argv)
	}
}

// TestManager_Send_WithoutModel verifies that an empty model string
// produces no --model flag in the argv.
func TestManager_Send_WithoutModel(t *testing.T) {
	argvFile := filepath.Join(t.TempDir(), "argv.txt")
	bin := spyBin(t, argvFile)

	m := agent.NewManager(bin)
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send(agent.SendRequest{CardID: "card-nomodel", Message: "hello", WorkDir: ""}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	for range events {
	}

	raw, err := os.ReadFile(argvFile)
	if err != nil {
		t.Fatalf("read argv file: %v", err)
	}
	for _, a := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if a == "--model" {
			t.Fatalf("did not expect --model in argv; got %s", raw)
		}
	}
}

// TestSend_NonEmptyEffortAddsFlag verifies a non-empty Effort on the
// SendRequest threads through to --effort <level> in the argv.
func TestSend_NonEmptyEffortAddsFlag(t *testing.T) {
	var capturedArgs []string
	builder := func(bin string, args []string, dir string) *exec.Cmd {
		capturedArgs = args
		// Use `true` binary so process exits immediately.
		return exec.Command("true")
	}
	m := agent.NewManagerWithBuilder("claude", builder)

	events := make(chan agent.StreamEvent, 4)
	if err := m.Send(agent.SendRequest{
		CardID:  "card-1",
		Model:   "claude-sonnet-4-6",
		Effort:  "max",
		Message: "ping",
	}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	for range events {
	}

	found := false
	for i, a := range capturedArgs {
		if a == "--effort" && i+1 < len(capturedArgs) && capturedArgs[i+1] == "max" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("argv missing --effort max; got %v", capturedArgs)
	}
}

// TestSend_EmptyEffortOmitsFlag verifies an empty Effort on the SendRequest
// produces no --effort flag in the argv.
func TestSend_EmptyEffortOmitsFlag(t *testing.T) {
	var capturedArgs []string
	builder := func(bin string, args []string, dir string) *exec.Cmd {
		capturedArgs = args
		return exec.Command("true")
	}
	m := agent.NewManagerWithBuilder("claude", builder)

	events := make(chan agent.StreamEvent, 4)
	if err := m.Send(agent.SendRequest{
		CardID:  "card-1",
		Model:   "claude-opus-4-6",
		Effort:  "",
		Message: "ping",
	}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	for range events {
	}

	for _, a := range capturedArgs {
		if a == "--effort" {
			t.Errorf("unexpected --effort in argv: %v", capturedArgs)
		}
	}
}

// TestManager_IsRunning verifies a process is tracked while active.
func TestManager_IsRunning(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send(agent.SendRequest{CardID: "card-3", Message: "hello", WorkDir: ""}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	if !m.IsRunning("card-3") {
		t.Error("expected card-3 to be running")
	}
}

// TestManager_Kill_TerminatesRunningProcess verifies Kill signals the
// spawned CLI so it exits and IsRunning flips back to false.
func TestManager_Kill_TerminatesRunningProcess(t *testing.T) {
	m := agent.NewManager(hangBin(t))
	events := make(chan agent.StreamEvent, 8)

	if err := m.Send(agent.SendRequest{CardID: "card-kill", Message: "hi", WorkDir: ""}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if m.IsRunning("card-kill") {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !m.IsRunning("card-kill") {
		t.Fatalf("expected card-kill to be running before Kill")
	}

	if err := m.Kill("card-kill"); err != nil {
		t.Fatalf("Kill: %v", err)
	}

	done := make(chan struct{})
	go func() {
		for range events {
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("events channel did not close after Kill")
	}

	if m.IsRunning("card-kill") {
		t.Errorf("expected card-kill to not be running after Kill")
	}
}

// TestManager_Kill_UnknownCardIsNoop verifies Kill on an unknown card is
// safe and returns nil.
func TestManager_Kill_UnknownCardIsNoop(t *testing.T) {
	m := agent.NewManager(echoBin(t))
	if err := m.Kill("missing"); err != nil {
		t.Errorf("Kill unknown: %v", err)
	}
}

// TestManager_SendPassesWorkDirToBuilder verifies that WorkDir is threaded
// into the commandBuilder so the process runs in the correct project directory.
func TestManager_SendPassesWorkDirToBuilder(t *testing.T) {
	exitZero := echoBin(t)
	var gotDir string
	m := agent.NewManagerWithBuilder(exitZero, func(bin string, args []string, dir string) *exec.Cmd {
		gotDir = dir
		return exec.Command(exitZero)
	})
	events := make(chan agent.StreamEvent, 1)
	err := m.Send(agent.SendRequest{
		CardID:  "c1",
		Message: "hi",
		WorkDir: "/tmp/proj-x",
	}, events)
	if err != nil {
		t.Fatalf("Send: %v", err)
	}
	// Drain until channel closes so the goroutine finishes.
	for range events {
	}
	if gotDir != "/tmp/proj-x" {
		t.Errorf("builder dir = %q, want /tmp/proj-x", gotDir)
	}
}
