package project_test

import (
	"errors"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/project"
)

type stubRunner struct {
	out string
	err error
}

func (s stubRunner) Run(name string, args ...string) (string, error) {
	return s.out, s.err
}

func TestPicker_ReturnsTrimmedPath(t *testing.T) {
	p := project.NewPicker("darwin", stubRunner{out: "/Users/me/Code/proj\n"})
	path, cancelled, err := p.Pick()
	if err != nil {
		t.Fatalf("Pick error: %v", err)
	}
	if cancelled {
		t.Error("expected cancelled=false")
	}
	if path != "/Users/me/Code/proj" {
		t.Errorf("path = %q, want /Users/me/Code/proj", path)
	}
}

func TestPicker_CancelReturnsCancelled(t *testing.T) {
	p := project.NewPicker("darwin", stubRunner{out: ""})
	_, cancelled, err := p.Pick()
	if err != nil {
		t.Fatalf("Pick error: %v", err)
	}
	if !cancelled {
		t.Error("expected cancelled=true when output empty")
	}
}

func TestPicker_UnsupportedPlatform(t *testing.T) {
	p := project.NewPicker("plan9", stubRunner{})
	_, _, err := p.Pick()
	if err == nil {
		t.Error("expected error for unsupported platform")
	}
}

func TestPicker_RunnerError(t *testing.T) {
	p := project.NewPicker("darwin", stubRunner{err: errors.New("boom")})
	_, _, err := p.Pick()
	if err == nil {
		t.Error("expected error when runner fails")
	}
}

func TestPicker_RunnerErrorWithStderrOutput_NotCancelled(t *testing.T) {
	p := project.NewPicker("linux", stubRunner{
		out: "zenity: command not found\n",
		err: errors.New("exit status 127"),
	})
	_, cancelled, err := p.Pick()
	if err == nil {
		t.Error("expected error, got nil")
	}
	if cancelled {
		t.Error("expected cancelled=false when stderr is non-empty")
	}
}
