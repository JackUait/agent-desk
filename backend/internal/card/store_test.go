package card_test

import (
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/card"
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
	if c.CreatedAt.IsZero() {
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

	// Bump time to ensure it would differ if overwritten
	time.Sleep(time.Millisecond)

	updated := created
	updated.CreatedAt = time.Now()
	s.Update(updated)

	got, _ := s.Get(created.ID)
	if !got.CreatedAt.Equal(original) {
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
