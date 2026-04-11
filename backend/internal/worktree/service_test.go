package worktree_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/worktree"
)

// initRepo initialises a bare git repo with one empty commit so worktree
// operations have something to branch from.
func initRepo(t *testing.T) string {
	t.Helper()

	repoDir := t.TempDir()

	cmds := [][]string{
		{"git", "init"},
		{"git", "config", "user.email", "test@example.com"},
		{"git", "config", "user.name", "Test"},
		{"git", "commit", "--allow-empty", "-m", "init"},
	}
	for _, args := range cmds {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repoDir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("initRepo %v: %v\n%s", args, err, out)
		}
	}

	return repoDir
}

func TestService_CreateAndRemove(t *testing.T) {
	repoDir := initRepo(t)
	base := t.TempDir()

	svc := worktree.NewService(repoDir, base)

	path, branch, err := svc.Create("card-abc")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Directory must exist.
	if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
		t.Fatalf("worktree directory %q does not exist after Create", path)
	}

	// Path must be inside base.
	expectedPath := filepath.Join(base, "card-abc")
	if path != expectedPath {
		t.Fatalf("expected path %q, got %q", expectedPath, path)
	}

	// Branch name must be correct.
	if branch != "agent/card-abc" {
		t.Fatalf("expected branch %q, got %q", "agent/card-abc", branch)
	}

	// Remove it.
	if removeErr := svc.Remove("card-abc"); removeErr != nil {
		t.Fatalf("Remove: %v", removeErr)
	}

	// Directory must be gone.
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("worktree directory %q still exists after Remove", path)
	}
}

func TestService_DuplicateCreateFails(t *testing.T) {
	repoDir := initRepo(t)
	base := t.TempDir()

	svc := worktree.NewService(repoDir, base)

	if _, _, err := svc.Create("card-dup"); err != nil {
		t.Fatalf("first Create: %v", err)
	}

	// Second create for the same cardID must fail (branch already exists).
	_, _, err := svc.Create("card-dup")
	if err == nil {
		t.Fatal("expected error on duplicate Create, got nil")
	}
}
