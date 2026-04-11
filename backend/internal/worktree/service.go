package worktree

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

// Service manages git worktrees for agent isolation.
type Service struct {
	repoDir      string
	worktreeBase string
}

// NewService returns a Service that creates worktrees inside worktreeBase,
// running git commands relative to repoDir.
func NewService(repoDir, worktreeBase string) *Service {
	return &Service{repoDir: repoDir, worktreeBase: worktreeBase}
}

// Create adds a new git worktree for cardID on branch agent/<cardID>.
// Returns the worktree path and branch name on success.
func (s *Service) Create(cardID string) (path string, branch string, err error) {
	path = filepath.Join(s.worktreeBase, cardID)
	branch = "agent/" + cardID

	cmd := exec.Command("git", "worktree", "add", path, "-b", branch)
	cmd.Dir = s.repoDir
	out, runErr := cmd.CombinedOutput()
	if runErr != nil {
		return "", "", fmt.Errorf("worktree: create %q: %w: %s", cardID, runErr, out)
	}
	return path, branch, nil
}

// Remove deletes the worktree directory and the associated branch.
// The branch deletion is best-effort; a branch error is logged but not returned.
func (s *Service) Remove(cardID string) error {
	path := filepath.Join(s.worktreeBase, cardID)

	// Remove worktree.
	rmCmd := exec.Command("git", "worktree", "remove", path, "--force")
	rmCmd.Dir = s.repoDir
	if out, err := rmCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("worktree: remove %q: %w: %s", cardID, err, out)
	}

	// Best-effort: delete the branch.
	branch := "agent/" + cardID
	branchCmd := exec.Command("git", "branch", "-D", branch)
	branchCmd.Dir = s.repoDir
	branchCmd.CombinedOutput() //nolint:errcheck

	return nil
}
