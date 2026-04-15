package contextusage

import (
	"context"
	"errors"
	"testing"
)

func TestRunner_Fetch_ExecsClaudeWithExpectedArgs(t *testing.T) {
	var capturedBin string
	var capturedArgs []string
	var capturedDir string

	runner := &Runner{
		ClaudeBin: "/usr/local/bin/claude",
		Exec: func(_ context.Context, bin string, args []string, dir string) ([]byte, error) {
			capturedBin = bin
			capturedArgs = args
			capturedDir = dir
			return []byte(`{"result":"**Tokens:** 20.3k / 1m (2%)\n\n### Estimated usage by category\n\n| Category | Tokens | Percentage |\n|-|-|-|\n| System prompt | 6.8k | 0.7% |\n"}`), nil
		},
	}

	u, err := runner.Fetch(context.Background(), "/path/to/project", "/tmp/mcp.json")
	if err != nil {
		t.Fatalf("Fetch error: %v", err)
	}

	if capturedBin != "/usr/local/bin/claude" {
		t.Errorf("bin = %q, want /usr/local/bin/claude", capturedBin)
	}
	if capturedDir != "/path/to/project" {
		t.Errorf("dir = %q, want /path/to/project", capturedDir)
	}

	wantFlags := []string{"-p", "--output-format", "json", "--mcp-config", "/tmp/mcp.json", "/context"}
	for _, f := range wantFlags {
		if !containsString(capturedArgs, f) {
			t.Errorf("args missing %q: %v", f, capturedArgs)
		}
	}

	if u.SystemPromptTokens != 6800 {
		t.Errorf("SystemPromptTokens = %d, want 6800", u.SystemPromptTokens)
	}
	if u.TotalTokens != 20300 {
		t.Errorf("TotalTokens = %d, want 20300", u.TotalTokens)
	}
}

func TestRunner_Fetch_OmitsMcpFlagWhenEmpty(t *testing.T) {
	var capturedArgs []string
	runner := &Runner{
		ClaudeBin: "claude",
		Exec: func(_ context.Context, _ string, args []string, _ string) ([]byte, error) {
			capturedArgs = args
			return []byte(`{"result":"**Tokens:** 1k / 200k (0%)\n| Category | Tokens | Percentage |\n| System prompt | 180 | 0% |\n"}`), nil
		},
	}
	_, err := runner.Fetch(context.Background(), "/p", "")
	if err != nil {
		t.Fatalf("Fetch error: %v", err)
	}
	if containsString(capturedArgs, "--mcp-config") {
		t.Errorf("expected --mcp-config to be omitted when path empty, got %v", capturedArgs)
	}
}

func TestRunner_Fetch_PropagatesExecError(t *testing.T) {
	runner := &Runner{
		ClaudeBin: "claude",
		Exec: func(_ context.Context, _ string, _ []string, _ string) ([]byte, error) {
			return nil, errors.New("boom")
		},
	}
	if _, err := runner.Fetch(context.Background(), "/p", ""); err == nil {
		t.Error("expected error from exec, got nil")
	}
}

func TestRunner_Fetch_ErrorsOnMalformedJSON(t *testing.T) {
	runner := &Runner{
		ClaudeBin: "claude",
		Exec: func(_ context.Context, _ string, _ []string, _ string) ([]byte, error) {
			return []byte("not json"), nil
		},
	}
	if _, err := runner.Fetch(context.Background(), "/p", ""); err == nil {
		t.Error("expected error from malformed json, got nil")
	}
}

func containsString(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
