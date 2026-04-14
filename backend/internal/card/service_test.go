package card

import (
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/domain"
)

func newTestService() *Service {
	return NewService(NewStore())
}

func TestCreateCard(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "my card")
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
	created := svc.CreateCard("proj-test", "x")
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
	svc.CreateCard("proj-test", "a")
	svc.CreateCard("proj-test", "b")
	cards := svc.ListCards("proj-test")
	if len(cards) != 2 {
		t.Fatalf("expected 2 cards, got %d", len(cards))
	}
}

func TestDeleteCard(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "del me")
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
	c := svc.CreateCard("proj-test", "dev card")
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
	c := svc.CreateCard("proj-test", "x")
	svc.StartDevelopment(c.ID) // move to in_progress
	_, err := svc.StartDevelopment(c.ID)
	if err == nil {
		t.Fatal("expected error transitioning from non-backlog column")
	}
}

func TestMoveToReview_fromInProgress(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
	_, err := svc.MoveToReview(c.ID) // still in backlog
	if err == nil {
		t.Fatal("expected error transitioning from backlog to review")
	}
}

func TestRejectToInProgress_fromReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
	_, err := svc.RejectToInProgress(c.ID) // in backlog
	if err == nil {
		t.Fatal("expected error rejecting from non-review column")
	}
}

func TestSetPRUrl_inReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
	_, err := svc.SetPRUrl(c.ID, "https://github.com/org/repo/pull/1")
	if err == nil {
		t.Fatal("expected error setting PR URL outside review")
	}
}

func TestMoveToDone_withPRUrl(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
	_, err := svc.MoveToDone(c.ID) // in backlog
	if err == nil {
		t.Fatal("expected error moving to done from non-review column")
	}
}

// --- SetWorktree / SetSessionID ---

func TestSetWorktree(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "x")
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

// --- SetModel ---

func TestSetModel_happyPath(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
	updated, err := svc.SetModel(c.ID, "claude-sonnet-4-6")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Model != "claude-sonnet-4-6" {
		t.Fatalf("expected model persisted, got %q", updated.Model)
	}
	// Re-read to verify persistence.
	got, err := svc.GetCard(c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Model != "claude-sonnet-4-6" {
		t.Fatalf("expected persisted model, got %q", got.Model)
	}
}

func TestSetModel_unknownModel(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
	_, err := svc.SetModel(c.ID, "bogus-model")
	if err == nil {
		t.Fatal("expected error for unknown model")
	}
	if !strings.Contains(err.Error(), "unknown model") {
		t.Fatalf("expected 'unknown model' in error, got %q", err.Error())
	}
}

func TestSetModel_unknownCard(t *testing.T) {
	svc := newTestService()
	_, err := svc.SetModel("ghost", "claude-opus-4-6")
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

// --- SetEffort ---

func TestSetEffort_HappyPath(t *testing.T) {
	store := NewStore()
	svc := NewService(store)
	c := svc.CreateCard("proj-1", "Card")

	updated, err := svc.SetEffort(c.ID, "high")
	if err != nil {
		t.Fatalf("SetEffort: unexpected error: %v", err)
	}
	if updated.Effort != "high" {
		t.Errorf("returned Effort = %q, want %q", updated.Effort, "high")
	}
	got, _ := svc.GetCard(c.ID)
	if got.Effort != "high" {
		t.Errorf("persisted Effort = %q, want %q", got.Effort, "high")
	}
}

func TestSetEffort_UnknownEffortRejected(t *testing.T) {
	store := NewStore()
	svc := NewService(store)
	c := svc.CreateCard("proj-1", "Card")

	_, err := svc.SetEffort(c.ID, "ultra")
	if err == nil {
		t.Fatalf("SetEffort(ultra): expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unknown effort") {
		t.Errorf("error = %q, want containing %q", err.Error(), "unknown effort")
	}
}

func TestSetEffort_UnknownCardRejected(t *testing.T) {
	store := NewStore()
	svc := NewService(store)

	_, err := svc.SetEffort("no-such-card", "low")
	if err == nil {
		t.Fatalf("SetEffort(missing card): expected error, got nil")
	}
}

// --- UpdateFields ---

func TestUpdateFields_strings(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "original")
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
	c := svc.CreateCard("proj-test", "x")
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
	c := svc.CreateCard("proj-test", "keep me")
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

// --- Messages ---

func TestService_AppendMessage_ErrorForUnknownCard(t *testing.T) {
	svc := newTestService()
	err := svc.AppendMessage("ghost", domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1})
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

func TestService_ListMessages_ErrorForUnknownCard(t *testing.T) {
	svc := newTestService()
	_, err := svc.ListMessages("ghost")
	if err == nil {
		t.Fatal("expected error for missing card")
	}
}

func TestService_ListMessages_ReturnsEmptySliceNotNil_ForNewCard(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
	msgs, err := svc.ListMessages(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if msgs == nil {
		t.Fatal("expected non-nil empty slice")
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages, got %d", len(msgs))
	}
}

func TestService_AppendMessage_ThenListMessages(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("proj-test", "x")
	if err := svc.AppendMessage(c.ID, domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1}); err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}
	if err := svc.AppendMessage(c.ID, domain.Message{ID: "m2", Role: "assistant", Content: "hello", Timestamp: 1}); err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}
	msgs, err := svc.ListMessages(c.ID)
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "user" || msgs[1].Role != "assistant" {
		t.Fatalf("messages out of order: %+v", msgs)
	}
}
