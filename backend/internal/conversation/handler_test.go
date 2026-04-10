package conversation_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/conversation"
)

func TestHandleGetConversation(t *testing.T) {
	handler := conversation.HandleGetConversation()
	req := httptest.NewRequest(http.MethodGet, "/api/conversations/conv-1", nil)
	req.SetPathValue("id", "conv-1")
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

func TestHandleCreateConversation(t *testing.T) {
	handler := conversation.HandleCreateConversation()
	req := httptest.NewRequest(http.MethodPost, "/api/conversations", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
}

func TestHandleAddMessage(t *testing.T) {
	handler := conversation.HandleAddMessage()
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/conv-1/messages", nil)
	req.SetPathValue("id", "conv-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}
