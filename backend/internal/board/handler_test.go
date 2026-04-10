package board_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/board"
)

func makeRequest(t *testing.T, handler http.HandlerFunc, method, path string, pathValues map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for k, v := range pathValues {
		req.SetPathValue(k, v)
	}
	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}

func assertStatus(t *testing.T, rec *httptest.ResponseRecorder, expected int) {
	t.Helper()
	if rec.Code != expected {
		t.Errorf("expected status %d, got %d", expected, rec.Code)
	}
}

func assertContentType(t *testing.T, rec *httptest.ResponseRecorder, expected string) {
	t.Helper()
	ct := rec.Header().Get("Content-Type")
	if ct != expected {
		t.Errorf("expected Content-Type %q, got %q", expected, ct)
	}
}

func assertJSONBody(t *testing.T, rec *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(target); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
}

func TestBoardHandlers(t *testing.T) {
	tests := []struct {
		name           string
		handler        http.HandlerFunc
		method         string
		path           string
		pathValues     map[string]string
		expectedStatus int
		checkBody      func(t *testing.T, rec *httptest.ResponseRecorder)
	}{
		{
			name:           "ListBoards returns empty array",
			handler:        board.ListBoards,
			method:         http.MethodGet,
			path:           "/api/boards",
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var boards []board.Board
				assertJSONBody(t, rec, &boards)
				if len(boards) != 0 {
					t.Errorf("expected empty array, got %d items", len(boards))
				}
			},
		},
		{
			name:           "GetBoard returns board with requested ID",
			handler:        board.GetBoard,
			method:         http.MethodGet,
			path:           "/api/boards/board-1",
			pathValues:     map[string]string{"id": "board-1"},
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var b board.Board
				assertJSONBody(t, rec, &b)
				if b.ID != "board-1" {
					t.Errorf("expected ID %q, got %q", "board-1", b.ID)
				}
			},
		},
		{
			name:           "CreateBoard returns created board",
			handler:        board.CreateBoard,
			method:         http.MethodPost,
			path:           "/api/boards",
			expectedStatus: http.StatusCreated,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var b board.Board
				assertJSONBody(t, rec, &b)
				if b.ID == "" {
					t.Error("expected non-empty ID")
				}
			},
		},
		{
			name:           "UpdateBoard returns updated board with ID",
			handler:        board.UpdateBoard,
			method:         http.MethodPut,
			path:           "/api/boards/board-1",
			pathValues:     map[string]string{"id": "board-1"},
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var b board.Board
				assertJSONBody(t, rec, &b)
				if b.ID != "board-1" {
					t.Errorf("expected ID %q, got %q", "board-1", b.ID)
				}
			},
		},
		{
			name:           "DeleteBoard returns no content",
			handler:        board.DeleteBoard,
			method:         http.MethodDelete,
			path:           "/api/boards/board-1",
			pathValues:     map[string]string{"id": "board-1"},
			expectedStatus: http.StatusNoContent,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				if rec.Body.Len() != 0 {
					t.Errorf("expected empty body, got %q", rec.Body.String())
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := makeRequest(t, tt.handler, tt.method, tt.path, tt.pathValues)
			assertStatus(t, rec, tt.expectedStatus)
			if tt.expectedStatus != http.StatusNoContent {
				assertContentType(t, rec, "application/json")
			}
			if tt.checkBody != nil {
				tt.checkBody(t, rec)
			}
		})
	}
}
