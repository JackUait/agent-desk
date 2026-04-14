package project_test

import (
	"path/filepath"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/project"
)

func TestStore_Create_AssignsFieldsAndColorIdx(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	p, err := s.Create("/tmp/myproject")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.ID == "" {
		t.Error("expected non-empty ID")
	}
	if p.Title != filepath.Base("/tmp/myproject") {
		t.Errorf("expected title %q, got %q", filepath.Base("/tmp/myproject"), p.Title)
	}
	if p.Path != "/tmp/myproject" {
		t.Errorf("expected path %q, got %q", "/tmp/myproject", p.Path)
	}
	if p.ColorIdx != 0 {
		t.Errorf("expected ColorIdx 0, got %d", p.ColorIdx)
	}
	if p.CreatedAt == 0 {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestStore_Create_RotatesColorIdx(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	for i := 0; i < 7; i++ {
		p, err := s.Create("/tmp/proj" + string(rune('a'+i)))
		if err != nil {
			t.Fatalf("unexpected error on iteration %d: %v", i, err)
		}
		want := i % project.ColorPaletteSize
		if p.ColorIdx != want {
			t.Errorf("project %d: expected ColorIdx %d, got %d", i, want, p.ColorIdx)
		}
	}
}

func TestStore_Get_NotFound(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	_, ok := s.Get("ghost")
	if ok {
		t.Error("expected Get to return ok=false for missing ID")
	}
}

func TestStore_List_SortedByCreatedAt(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	s.Create("/tmp/alpha")
	s.Create("/tmp/beta")

	list := s.List()
	if len(list) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(list))
	}
	if list[0].Title != "alpha" {
		t.Errorf("expected first project title %q, got %q", "alpha", list[0].Title)
	}
	if list[1].Title != "beta" {
		t.Errorf("expected second project title %q, got %q", "beta", list[1].Title)
	}
}

func TestStore_UpdateTitle(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	p, _ := s.Create("/tmp/myproject")

	ok := s.UpdateTitle(p.ID, "Renamed Project")
	if !ok {
		t.Fatal("expected UpdateTitle to return true")
	}

	got, _ := s.Get(p.ID)
	if got.Title != "Renamed Project" {
		t.Errorf("expected title %q, got %q", "Renamed Project", got.Title)
	}
}

func TestStore_UpdateTitle_NotFound(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	ok := s.UpdateTitle("ghost", "Whatever")
	if ok {
		t.Error("expected UpdateTitle to return false for missing ID")
	}
}

func TestStore_Delete(t *testing.T) {
	s := project.NewStore(&project.StubGit{IsRepoVal: true})
	p, _ := s.Create("/tmp/myproject")

	ok := s.Delete(p.ID)
	if !ok {
		t.Fatal("expected Delete to return true")
	}

	_, found := s.Get(p.ID)
	if found {
		t.Error("expected project to be gone after Delete")
	}
}

func TestStore_Create_RunsGitInitWhenNotARepo(t *testing.T) {
	git := &project.StubGit{IsRepoVal: false}
	s := project.NewStore(git)

	_, err := s.Create("/tmp/newrepo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(git.InitCalled) != 1 || git.InitCalled[0] != "/tmp/newrepo" {
		t.Errorf("expected Init called with %q, got %v", "/tmp/newrepo", git.InitCalled)
	}
}
