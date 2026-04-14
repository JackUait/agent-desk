package project

import (
	"fmt"
	"os/exec"
)

type RealGit struct{}

func NewRealGit() *RealGit { return &RealGit{} }

func (RealGit) IsRepo(path string) bool {
	cmd := exec.Command("git", "rev-parse", "--git-dir")
	cmd.Dir = path
	return cmd.Run() == nil
}

func (RealGit) Init(path string) error {
	cmd := exec.Command("git", "init")
	cmd.Dir = path
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("project: git init %s: %w: %s", path, err, out)
	}
	return nil
}
