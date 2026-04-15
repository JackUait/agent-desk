package contextusage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// ExecFunc runs an external command and returns its stdout. Tests inject a
// stub; production uses DefaultExec.
type ExecFunc func(ctx context.Context, bin string, args []string, dir string) ([]byte, error)

// Runner shells out to the Claude CLI's `/context` slash command and parses
// the result into a Usage struct. The zero value is not usable — ClaudeBin
// must be set; Exec defaults to DefaultExec if left nil.
type Runner struct {
	ClaudeBin string
	Exec      ExecFunc
}

// Fetch runs `claude -p --output-format json /context` in projectPath with the
// MCP config that real agent sessions use, so that the reported category
// breakdown matches what the agent will actually see at runtime.
//
// Pass mcpConfigPath = "" to omit the --mcp-config flag (useful for tests and
// for projects without an agent-desk MCP temp file yet).
func (r *Runner) Fetch(ctx context.Context, projectPath, mcpConfigPath string) (Usage, error) {
	if r.ClaudeBin == "" {
		return Usage{}, fmt.Errorf("contextusage: ClaudeBin is empty")
	}
	execFn := r.Exec
	if execFn == nil {
		execFn = DefaultExec
	}

	args := []string{"-p", "--output-format", "json"}
	if mcpConfigPath != "" {
		args = append(args, "--mcp-config", mcpConfigPath)
	}
	args = append(args, "/context")

	stdout, err := execFn(ctx, r.ClaudeBin, args, projectPath)
	if err != nil {
		return Usage{}, fmt.Errorf("contextusage: exec claude: %w", err)
	}

	var envelope struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(stdout), &envelope); err != nil {
		return Usage{}, fmt.Errorf("contextusage: decode claude json: %w", err)
	}
	if envelope.Result == "" {
		return Usage{}, fmt.Errorf("contextusage: claude returned empty result field")
	}
	return Parse(envelope.Result)
}

// DefaultExec runs an *exec.Cmd and returns its stdout. Kept separate so that
// tests can inject a fake without touching os/exec.
func DefaultExec(ctx context.Context, bin string, args []string, dir string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	return stdout.Bytes(), nil
}
