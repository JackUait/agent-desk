package card

import (
	"strings"
	"testing"
)

func newTestService() *Service {
	return NewService(NewStore())
}

func TestCreateCard(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("my card")
	if c.Title != "my card" {
		t.Fatalf("expected title 'my card', got %q", c.Title)
	}
	if c.Column != ColumnBacklog {
		t.Fatalf("expected column backlog, got %q", c.Column)
	}
	if c.ID == "" {
		t.Fatal("expected non-empty ID")
	}
}

func TestGetCard_found(t *testing.T) {
	svc := newTestService()
	created := svc.CreateCard("x")
	got, err := svc.GetCard(created.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != created.ID {
		t.Fatalf("id mismatch: %q vs %q", got.ID, created.ID)
	}
}

func TestGetCard_notFound(t *testing.T) {
	svc := newTestService()
	_, err := svc.GetCard("nonexistent")
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

func TestListCards(t *testing.T) {
	svc := newTestService()
	svc.CreateCard("a")
	svc.CreateCard("b")
	cards := svc.ListCards()
	if len(cards) != 2 {
		t.Fatalf("expected 2 cards, got %d", len(cards))
	}
}

func TestDeleteCard(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("del me")
	if err := svc.DeleteCard(c.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, err := svc.GetCard(c.ID)
	if err == nil {
		t.Fatal("expected card to be gone")
	}
}

func TestDeleteCard_notFound(t *testing.T) {
	svc := newTestService()
	if err := svc.DeleteCard("ghost"); err == nil {
		t.Fatal("expected error deleting nonexistent card")
	}
}

// --- State machine transitions ---

func TestStartDevelopment_fromBacklog(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("dev card")
	updated, err := svc.StartDevelopment(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Column != ColumnInProgress {
		t.Fatalf("expected in_progress, got %q", updated.Column)
	}
}

func TestStartDevelopment_invalidColumn(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID) // move to in_progress
	_, err := svc.StartDevelopment(c.ID)
	if err == nil {
		t.Fatal("expected error transitioning from non-backlog column")
	}
}

func TestMoveToReview_fromInProgress(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID)
	updated, err := svc.MoveToReview(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Column != ColumnReview {
		t.Fatalf("expected review, got %q", updated.Column)
	}
}

func TestMoveToReview_invalidColumn(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	_, err := svc.MoveToReview(c.ID) // still in backlog
	if err == nil {
		t.Fatal("expected error transitioning from backlog to review")
	}
}

func TestRejectToInProgress_fromReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	updated, err := svc.RejectToInProgress(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Column != ColumnInProgress {
		t.Fatalf("expected in_progress, got %q", updated.Column)
	}
}

func TestRejectToInProgress_invalidColumn(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	_, err := svc.RejectToInProgress(c.ID) // in backlog
	if err == nil {
		t.Fatal("expected error rejecting from non-review column")
	}
}

func TestSetPRUrl_inReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	updated, err := svc.SetPRUrl(c.ID, "https://github.com/org/repo/pull/1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.PRUrl != "https://github.com/org/repo/pull/1" {
		t.Fatalf("expected PR url, got %q", updated.PRUrl)
	}
}

func TestSetPRUrl_notInReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	_, err := svc.SetPRUrl(c.ID, "https://github.com/org/repo/pull/1")
	if err == nil {
		t.Fatal("expected error setting PR URL outside review")
	}
}

func TestMoveToDone_withPRUrl(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	svc.SetPRUrl(c.ID, "https://github.com/org/repo/pull/1")
	updated, err := svc.MoveToDone(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Column != ColumnDone {
		t.Fatalf("expected done, got %q", updated.Column)
	}
}

func TestMoveToDone_noPRUrl(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	_, err := svc.MoveToDone(c.ID)
	if err == nil {
		t.Fatal("expected error moving to done without PR URL")
	}
	if !strings.Contains(err.Error(), "PR") {
		t.Fatalf("expected error to mention PR, got %q", err.Error())
	}
}

func TestMoveToDone_invalidColumn(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	_, err := svc.MoveToDone(c.ID) // in backlog
	if err == nil {
		t.Fatal("expected error moving to done from non-review column")
	}
}

// --- SetWorktree / SetSessionID ---

func TestSetWorktree(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	updated, err := svc.SetWorktree(c.ID, "/tmp/wt", "feature/x")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.WorktreePath != "/tmp/wt" {
		t.Fatalf("expected worktree path, got %q", updated.WorktreePath)
	}
	if updated.BranchName != "feature/x" {
		t.Fatalf("expected branch name, got %q", updated.BranchName)
	}
}

func TestSetWorktree_notFound(t *testing.T) {
	svc := newTestService()
	_, err := svc.SetWorktree("ghost", "/tmp", "branch")
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

func TestSetSessionID(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	updated, err := svc.SetSessionID(c.ID, "sess-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.SessionID != "sess-abc" {
		t.Fatalf("expected session ID, got %q", updated.SessionID)
	}
}

func TestSetSessionID_notFound(t *testing.T) {
	svc := newTestService()
	_, err := svc.SetSessionID("ghost", "sess-abc")
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

// --- UpdateFields ---

func TestUpdateFields_strings(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("original")
	updated, err := svc.UpdateFields(c.ID, map[string]any{
		"title":       "updated",
		"description": "a description",
		"complexity":  "high",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Title != "updated" {
		t.Fatalf("expected 'updated', got %q", updated.Title)
	}
	if updated.Description != "a description" {
		t.Fatalf("expected description, got %q", updated.Description)
	}
	if updated.Complexity != "high" {
		t.Fatalf("expected 'high', got %q", updated.Complexity)
	}
}

func TestUpdateFields_slices(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("x")
	updated, err := svc.UpdateFields(c.ID, map[string]any{
		"acceptanceCriteria": []string{"ac1", "ac2"},
		"relevantFiles":      []string{"file.go"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(updated.AcceptanceCriteria) != 2 {
		t.Fatalf("expected 2 acceptance criteria, got %d", len(updated.AcceptanceCriteria))
	}
	if len(updated.RelevantFiles) != 1 {
		t.Fatalf("expected 1 relevant file, got %d", len(updated.RelevantFiles))
	}
}

func TestUpdateFields_partial(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("keep me")
	updated, err := svc.UpdateFields(c.ID, map[string]any{
		"description": "only this changed",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// title should be unchanged
	if updated.Title != "keep me" {
		t.Fatalf("expected title 'keep me', got %q", updated.Title)
	}
	if updated.Description != "only this changed" {
		t.Fatalf("expected description, got %q", updated.Description)
	}
}

func TestUpdateFields_notFound(t *testing.T) {
	svc := newTestService()
	_, err := svc.UpdateFields("ghost", map[string]any{"title": "x"})
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}
