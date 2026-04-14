package project

import (
	"fmt"
	"os/exec"
	"strings"
)

// Runner runs an external command and returns its stdout (as string) and error.
// Test stubs can satisfy this without exec.
type Runner interface {
	Run(name string, args ...string) (string, error)
}

// ExecRunner is the production implementation.
type ExecRunner struct{}

func (ExecRunner) Run(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	return string(out), err
}

// Picker opens a native OS folder dialog and returns the chosen path.
type Picker struct {
	goos   string
	runner Runner
}

func NewPicker(goos string, runner Runner) *Picker {
	return &Picker{goos: goos, runner: runner}
}

// Pick returns (path, cancelled, error). When the user dismisses the dialog,
// cancelled is true and path is empty.
func (p *Picker) Pick() (string, bool, error) {
	name, args, ok := p.command()
	if !ok {
		return "", false, fmt.Errorf("project: no folder picker for %s", p.goos)
	}
	out, err := p.runner.Run(name, args...)
	if err != nil {
		// Empty output + non-zero exit → treat as cancelled.
		if strings.TrimSpace(out) == "" && isExitError(err) {
			return "", true, nil
		}
		return "", false, fmt.Errorf("project: picker: %w", err)
	}
	path := strings.TrimSpace(out)
	if path == "" {
		return "", true, nil
	}
	return path, false, nil
}

func (p *Picker) command() (string, []string, bool) {
	switch p.goos {
	case "darwin":
		return "osascript", []string{"-e", `try
	set f to choose folder with prompt "Pick a project folder"
	POSIX path of f
on error number -128
	""
end try`}, true
	case "linux":
		return "zenity", []string{"--file-selection", "--directory"}, true
	case "windows":
		return "powershell", []string{"-NoProfile", "-Command",
			"Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; [void]$f.ShowDialog(); $f.SelectedPath"}, true
	}
	return "", nil, false
}

func isExitError(err error) bool {
	_, ok := err.(*exec.ExitError)
	return ok
}
