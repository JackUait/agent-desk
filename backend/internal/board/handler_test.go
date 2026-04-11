package board_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/card"
)

func newBoardHandler() *board.Handler {
	store := card.NewStore()
	return board.NewHandler(store)
}

func newBoardHandlerWithStore(store *card.Store) *board.Handler {
	return board.NewHandler(store)
}

func TestGetBoardReturnsFourColumns(t *testing.T) {
	h := newBoardHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/board", nil)
	rec := httptest.NewRecorder()
	h.GetBoard(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp board.BoardResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}

	if len(resp.Columns) != 4 {
		t.Errorf("expected 4 columns, got %d", len(resp.Columns))
	}

	wantIDs := []string{"col-backlog", "col-progress", "col-review", "col-done"}
	for i, col := range resp.Columns {
		if col.ID != wantIDs[i] {
			t.Errorf("column %d: expected ID %q, got %q", i, wantIDs[i], col.ID)
		}
		if col.CardIDs == nil {
			t.Errorf("column %d: CardIDs must not be nil", i)
		}
	}
}

func TestGetBoardCardAppearsInCorrectColumn(t *testing.T) {
	store := card.NewStore()
	created := store.Create("Test Card")
	h := newBoardHandlerWithStore(store)

	req := httptest.NewRequest(http.MethodGet, "/api/board", nil)
	rec := httptest.NewRecorder()
	h.GetBoard(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp board.BoardResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	var backlogCol board.ColumnResponse
	for _, col := range resp.Columns {
		if col.ID == "col-backlog" {
			backlogCol = col
			break
		}
	}

	if len(backlogCol.CardIDs) != 1 {
		t.Fatalf("expected 1 card in backlog, got %d", len(backlogCol.CardIDs))
	}
	if backlogCol.CardIDs[0] != created.ID {
		t.Errorf("expected card ID %q in backlog, got %q", created.ID, backlogCol.CardIDs[0])
	}
}
