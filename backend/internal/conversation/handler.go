package conversation

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/domain"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func HandleGetConversation() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Conversation{ID: id, Messages: []domain.Message{}})
	})
}

func HandleCreateConversation() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, Conversation{ID: "new", Messages: []domain.Message{}})
	})
}

func HandleAddMessage() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, domain.Message{ID: "msg-1", Role: "user", Content: ""})
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/conversations/{id}", HandleGetConversation())
	mux.Handle("POST /api/conversations", HandleCreateConversation())
	mux.Handle("POST /api/conversations/{id}/messages", HandleAddMessage())
}
