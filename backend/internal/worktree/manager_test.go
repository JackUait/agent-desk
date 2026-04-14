package worktree_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/worktree"
)

func TestManager_ForReturnsCachedServicePerProject(t *testing.T) {
	m := worktree.NewManager()
	svc := m.For("proj-1", "/tmp/repo")
	if svc == nil {
		t.Fatal("For returned nil")
	}
	again := m.For("proj-1", "/tmp/repo")
	if svc != again {
		t.Error("For did not cache service per projectID")
	}
}

func TestManager_ForDifferentProjectsGetDifferentServices(t *testing.T) {
	m := worktree.NewManager()
	a := m.For("proj-a", "/tmp/a")
	b := m.For("proj-b", "/tmp/b")
	if a == b {
		t.Error("different projects should get different services")
	}
}

func TestManager_RemoveClearsCachedService(t *testing.T) {
	m := worktree.NewManager()
	first := m.For("proj-1", "/tmp/repo")
	m.Remove("proj-1")
	second := m.For("proj-1", "/tmp/repo")
	if first == second {
		t.Error("expected a fresh *Service after Remove; got the cached one")
	}
}
