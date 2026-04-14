package project_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/project"
)

func TestRealGit_IsRepo_FalseForEmptyDir(t *testing.T) {
	dir := t.TempDir()
	g := project.NewRealGit()
	if g.IsRepo(dir) {
		t.Error("empty dir should not be a repo")
	}
}

func TestRealGit_Init_CreatesRepo(t *testing.T) {
	dir := t.TempDir()
	g := project.NewRealGit()
	if err := g.Init(dir); err != nil {
		t.Fatalf("Init: %v", err)
	}
	if !g.IsRepo(dir) {
		t.Error("IsRepo should be true after Init")
	}
	if _, err := os.Stat(filepath.Join(dir, ".git")); err != nil {
		t.Errorf(".git dir not created: %v", err)
	}
}
