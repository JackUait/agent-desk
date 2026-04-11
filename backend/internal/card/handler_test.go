package card_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func newHandler() *card.Handler {
	store := card.NewStore()
	svc := card.NewService(store)
	return card.NewHandler(svc)
}

func TestCreateCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"title":"My Task"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
	var c card.Card
	if err := json.NewDecoder(rec.Body).Decode(&c); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if c.ID == "" {
		t.Error("expected non-empty ID")
	}
	if c.Title != "My Task" {
		t.Errorf("expected title %q, got %q", "My Task", c.Title)
	}
	if c.Column != card.ColumnBacklog {
		t.Errorf("expected column %q, got %q", card.ColumnBacklog, c.Column)
	}
}

func TestListCards(t *testing.T) {
	h := newHandler()
	// create two cards first
	for _, title := range []string{"Alpha", "Beta"} {
		body := strings.NewReader(`{"title":"` + title + `"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
		rec := httptest.NewRecorder()
		h.CreateCard(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var cards []card.Card
	if err := json.NewDecoder(rec.Body).Decode(&cards); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(cards) != 2 {
		t.Errorf("expected 2 cards, got %d", len(cards))
	}
}

func TestGetCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"title":"Find Me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req2 := httptest.NewRequest(http.MethodGet, "/api/cards/"+created.ID, nil)
	req2.SetPathValue("id", created.ID)
	rec2 := httptest.NewRecorder()
	h.GetCard(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec2.Code)
	}
	var got card.Card
	json.NewDecoder(rec2.Body).Decode(&got)
	if got.ID != created.ID {
		t.Errorf("expected ID %q, got %q", created.ID, got.ID)
	}
}

func TestGetCardNotFound(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/cards/nope", nil)
	req.SetPathValue("id", "nope")
	rec := httptest.NewRecorder()
	h.GetCard(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteCard(t *testing.T) {
	h := newHandler()
	body := strings.NewReader(`{"title":"Delete Me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)

	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req2 := httptest.NewRequest(http.MethodDelete, "/api/cards/"+created.ID, nil)
	req2.SetPathValue("id", created.ID)
	rec2 := httptest.NewRecorder()
	h.DeleteCard(rec2, req2)

	if rec2.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec2.Code)
	}

	// confirm it's gone
	req3 := httptest.NewRequest(http.MethodGet, "/api/cards/"+created.ID, nil)
	req3.SetPathValue("id", created.ID)
	rec3 := httptest.NewRecorder()
	h.GetCard(rec3, req3)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", rec3.Code)
	}
}

func TestDeleteCardNotFound(t *testing.T) {
	h := newHandler()
	req := httptest.NewRequest(http.MethodDelete, "/api/cards/ghost", nil)
	req.SetPathValue("id", "ghost")
	rec := httptest.NewRecorder()
	h.DeleteCard(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
