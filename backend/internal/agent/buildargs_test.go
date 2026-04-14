package agent

import "testing"

// These tests exercise the unexported buildArgs helper directly, so they
// live in the agent package (not agent_test).

func TestBuildArgs_NoSessionNoModel(t *testing.T) {
	args := buildArgs("", "", "", "hello")
	if last := args[len(args)-1]; last != "hello" {
		t.Fatalf("prompt should be last, got %v", args)
	}
	if contains(args, "--resume") {
		t.Fatalf("unexpected --resume: %v", args)
	}
	if contains(args, "--model") {
		t.Fatalf("unexpected --model: %v", args)
	}
}

func TestBuildArgs_SessionNoModel(t *testing.T) {
	args := buildArgs("sess-1", "", "", "hi")
	if !contains(args, "--resume") {
		t.Fatalf("expected --resume: %v", args)
	}
	if idx := indexOf(args, "--resume"); args[idx+1] != "sess-1" {
		t.Fatalf("--resume not followed by session id: %v", args)
	}
	if contains(args, "--model") {
		t.Fatalf("unexpected --model: %v", args)
	}
	if args[len(args)-1] != "hi" {
		t.Fatalf("prompt should be last: %v", args)
	}
}

func TestBuildArgs_NoSessionWithModel(t *testing.T) {
	args := buildArgs("", "claude-opus-4-6", "", "hi")
	if contains(args, "--resume") {
		t.Fatalf("unexpected --resume: %v", args)
	}
	idx := indexOf(args, "--model")
	if idx < 0 {
		t.Fatalf("expected --model: %v", args)
	}
	if args[idx+1] != "claude-opus-4-6" {
		t.Fatalf("--model not followed by model id: %v", args)
	}
	if args[len(args)-1] != "hi" {
		t.Fatalf("prompt should be last: %v", args)
	}
	// --model must come before the positional prompt.
	if idx >= len(args)-1 {
		t.Fatalf("--model must be before prompt: %v", args)
	}
}

func TestBuildArgs_SessionAndModel(t *testing.T) {
	args := buildArgs("sess-2", "claude-haiku-4-5", "", "yo")
	if !contains(args, "--resume") {
		t.Fatalf("expected --resume: %v", args)
	}
	if !contains(args, "--model") {
		t.Fatalf("expected --model: %v", args)
	}
	if args[len(args)-1] != "yo" {
		t.Fatalf("prompt should be last: %v", args)
	}
}

func TestBuildArgs_EffortAppendedAfterModel(t *testing.T) {
	args := buildArgs("", "claude-sonnet-4-6", "high", "hello")

	modelIdx := indexOf(args, "--model")
	effortIdx := indexOf(args, "--effort")
	if modelIdx < 0 {
		t.Fatalf("expected --model in argv: %v", args)
	}
	if effortIdx < 0 {
		t.Fatalf("expected --effort in argv: %v", args)
	}
	if effortIdx < modelIdx {
		t.Errorf("--effort must come after --model: %v", args)
	}
	if args[effortIdx+1] != "high" {
		t.Errorf("--effort not followed by value 'high': %v", args)
	}
	// Prompt must still be final positional argument.
	if args[len(args)-1] != "hello" {
		t.Errorf("prompt must be last: %v", args)
	}
	// --effort must appear before the prompt.
	if effortIdx+1 >= len(args)-1 {
		t.Errorf("--effort must be before prompt: %v", args)
	}
}

func TestBuildArgs_EmptyEffortOmitted(t *testing.T) {
	args := buildArgs("", "claude-opus-4-6", "", "hello")
	if contains(args, "--effort") {
		t.Errorf("unexpected --effort in argv: %v", args)
	}
}

func TestBuildArgs_EmptyModelAndEffort(t *testing.T) {
	args := buildArgs("", "", "", "hello")
	if contains(args, "--model") || contains(args, "--effort") {
		t.Errorf("unexpected model/effort flags: %v", args)
	}
}

func contains(args []string, want string) bool {
	return indexOf(args, want) >= 0
}

func indexOf(args []string, want string) int {
	for i, a := range args {
		if a == want {
			return i
		}
	}
	return -1
}

