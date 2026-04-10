package conversation_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/conversation"
	"github.com/jackuait/agent-desk/backend/internal/domain"
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

func TestConversationHandlers(t *testing.T) {
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
			name:           "GetConversation returns conversation with requested ID",
			handler:        conversation.GetConversation,
			method:         http.MethodGet,
			path:           "/api/conversations/conv-1",
			pathValues:     map[string]string{"id": "conv-1"},
			expectedStatus: http.StatusOK,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var conv conversation.Conversation
				assertJSONBody(t, rec, &conv)
				if conv.ID != "conv-1" {
					t.Errorf("expected ID %q, got %q", "conv-1", conv.ID)
				}
				if conv.Messages == nil {
					t.Error("expected non-nil messages array")
				}
			},
		},
		{
			name:           "CreateConversation returns created conversation",
			handler:        conversation.CreateConversation,
			method:         http.MethodPost,
			path:           "/api/conversations",
			expectedStatus: http.StatusCreated,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var conv conversation.Conversation
				assertJSONBody(t, rec, &conv)
				if conv.ID == "" {
					t.Error("expected non-empty ID")
				}
			},
		},
		{
			name:           "AddMessage returns created message",
			handler:        conversation.AddMessage,
			method:         http.MethodPost,
			path:           "/api/conversations/conv-1/messages",
			pathValues:     map[string]string{"id": "conv-1"},
			expectedStatus: http.StatusCreated,
			checkBody: func(t *testing.T, rec *httptest.ResponseRecorder) {
				var msg domain.Message
				assertJSONBody(t, rec, &msg)
				if msg.ID == "" {
					t.Error("expected non-empty message ID")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := makeRequest(t, tt.handler, tt.method, tt.path, tt.pathValues)
			assertStatus(t, rec, tt.expectedStatus)
			assertContentType(t, rec, "application/json")
			if tt.checkBody != nil {
				tt.checkBody(t, rec)
			}
		})
	}
}
