package board_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/board"
)

func TestHandleListBoards(t *testing.T) {
	handler := board.HandleListBoards()
	req := httptest.NewRequest(http.MethodGet, "/api/boards", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}

func TestHandleGetBoard(t *testing.T) {
	handler := board.HandleGetBoard()
	req := httptest.NewRequest(http.MethodGet, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}

func TestHandleCreateBoard(t *testing.T) {
	handler := board.HandleCreateBoard()
	req := httptest.NewRequest(http.MethodPost, "/api/boards", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
}

func TestHandleUpdateBoard(t *testing.T) {
	handler := board.HandleUpdateBoard()
	req := httptest.NewRequest(http.MethodPut, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
}

func TestHandleDeleteBoard(t *testing.T) {
	handler := board.HandleDeleteBoard()
	req := httptest.NewRequest(http.MethodDelete, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
}
