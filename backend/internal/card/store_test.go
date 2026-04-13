package card_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/internal/domain"
)

func TestStore_Create(t *testing.T) {
	s := card.NewStore()
	c := s.Create("Fix login bug")

	if c.ID == "" {
		t.Error("expected non-empty ID")
	}
	if c.Title != "Fix login bug" {
		t.Errorf("expected title %q, got %q", "Fix login bug", c.Title)
	}
	if c.Column != card.ColumnBacklog {
		t.Errorf("expected column %q, got %q", card.ColumnBacklog, c.Column)
	}
	if c.CreatedAt == 0 {
		t.Error("expected non-zero CreatedAt")
	}
}

func TestStore_Create_UniqueIDs(t *testing.T) {
	s := card.NewStore()
	a := s.Create("Card A")
	b := s.Create("Card B")
	if a.ID == b.ID {
		t.Errorf("expected unique IDs, both got %q", a.ID)
	}
}

func TestStore_Get(t *testing.T) {
	s := card.NewStore()
	created := s.Create("My card")

	got, ok := s.Get(created.ID)
	if !ok {
		t.Fatal("expected Get to return ok=true")
	}
	if got.ID != created.ID {
		t.Errorf("expected ID %q, got %q", created.ID, got.ID)
	}
	if got.Title != "My card" {
		t.Errorf("expected title %q, got %q", "My card", got.Title)
	}
}

func TestStore_Get_NotFound(t *testing.T) {
	s := card.NewStore()
	_, ok := s.Get("nonexistent")
	if ok {
		t.Error("expected Get to return ok=false for missing ID")
	}
}

func TestStore_List(t *testing.T) {
	s := card.NewStore()

	cards := s.List()
	if len(cards) != 0 {
		t.Errorf("expected empty list, got %d items", len(cards))
	}

	s.Create("Card 1")
	s.Create("Card 2")
	s.Create("Card 3")

	cards = s.List()
	if len(cards) != 3 {
		t.Errorf("expected 3 cards, got %d", len(cards))
	}
}

func TestStore_Update(t *testing.T) {
	s := card.NewStore()
	created := s.Create("Original title")

	updated := created
	updated.Title = "Updated title"
	updated.Column = card.ColumnInProgress
	updated.Description = "Some description"

	ok := s.Update(updated)
	if !ok {
		t.Fatal("expected Update to return true")
	}

	got, _ := s.Get(created.ID)
	if got.Title != "Updated title" {
		t.Errorf("expected title %q, got %q", "Updated title", got.Title)
	}
	if got.Column != card.ColumnInProgress {
		t.Errorf("expected column %q, got %q", card.ColumnInProgress, got.Column)
	}
	if got.Description != "Some description" {
		t.Errorf("expected description %q, got %q", "Some description", got.Description)
	}
}

func TestStore_Update_PreservesCreatedAt(t *testing.T) {
	s := card.NewStore()
	created := s.Create("Card")
	original := created.CreatedAt

	updated := created
	updated.CreatedAt = original + 999 // attempt to overwrite with a different value
	s.Update(updated)

	got, _ := s.Get(created.ID)
	if got.CreatedAt != original {
		t.Error("Update must not overwrite CreatedAt")
	}
}

func TestStore_Update_NotFound(t *testing.T) {
	s := card.NewStore()
	ok := s.Update(card.Card{ID: "ghost", Title: "Ghost"})
	if ok {
		t.Error("expected Update to return false for missing ID")
	}
}

func TestStore_Delete(t *testing.T) {
	s := card.NewStore()
	created := s.Create("To delete")

	ok := s.Delete(created.ID)
	if !ok {
		t.Fatal("expected Delete to return true")
	}

	_, found := s.Get(created.ID)
	if found {
		t.Error("expected card to be gone after Delete")
	}
}

func TestStore_Delete_NotFound(t *testing.T) {
	s := card.NewStore()
	ok := s.Delete("ghost")
	if ok {
		t.Error("expected Delete to return false for missing ID")
	}
}

func TestStore_AppendMessage_ReturnsTrue_ForExistingCard(t *testing.T) {
	s := card.NewStore()
	c := s.Create("msg card")
	ok := s.AppendMessage(c.ID, domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1})
	if !ok {
		t.Fatal("expected AppendMessage to return true")
	}
}

func TestStore_AppendMessage_ReturnsFalse_ForUnknownCard(t *testing.T) {
	s := card.NewStore()
	ok := s.AppendMessage("ghost", domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1})
	if ok {
		t.Fatal("expected AppendMessage to return false")
	}
}

func TestStore_ListMessages_EmptyForNewCard(t *testing.T) {
	s := card.NewStore()
	c := s.Create("msg card")
	msgs, ok := s.ListMessages(c.ID)
	if !ok {
		t.Fatal("expected ListMessages to return ok=true")
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages, got %d", len(msgs))
	}
}

func TestStore_ListMessages_ReturnsAppendedMessagesInOrder(t *testing.T) {
	s := card.NewStore()
	c := s.Create("msg card")
	s.AppendMessage(c.ID, domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1})
	s.AppendMessage(c.ID, domain.Message{ID: "m2", Role: "assistant", Content: "hello", Timestamp: 1})
	s.AppendMessage(c.ID, domain.Message{ID: "m3", Role: "user", Content: "bye", Timestamp: 2})
	msgs, ok := s.ListMessages(c.ID)
	if !ok {
		t.Fatal("expected ListMessages to return ok=true")
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(msgs))
	}
	if msgs[0].ID != "m1" || msgs[1].ID != "m2" || msgs[2].ID != "m3" {
		t.Fatalf("messages out of order: %+v", msgs)
	}
}

func TestStore_ListMessages_NotFoundForUnknownCard(t *testing.T) {
	s := card.NewStore()
	_, ok := s.ListMessages("ghost")
	if ok {
		t.Fatal("expected ListMessages to return ok=false for missing card")
	}
}

func TestStore_Delete_ClearsMessages(t *testing.T) {
	s := card.NewStore()
	c := s.Create("msg card")
	s.AppendMessage(c.ID, domain.Message{ID: "m1", Role: "user", Content: "hi", Timestamp: 1})
	if !s.Delete(c.ID) {
		t.Fatal("Delete failed")
	}
	if _, ok := s.ListMessages(c.ID); ok {
		t.Fatal("expected ListMessages to return ok=false after Delete")
	}
}

func TestStore_ColumnConstants(t *testing.T) {
	if card.ColumnBacklog != "backlog" {
		t.Errorf("ColumnBacklog = %q, want %q", card.ColumnBacklog, "backlog")
	}
	if card.ColumnInProgress != "in_progress" {
		t.Errorf("ColumnInProgress = %q, want %q", card.ColumnInProgress, "in_progress")
	}
	if card.ColumnReview != "review" {
		t.Errorf("ColumnReview = %q, want %q", card.ColumnReview, "review")
	}
	if card.ColumnDone != "done" {
		t.Errorf("ColumnDone = %q, want %q", card.ColumnDone, "done")
	}
}
