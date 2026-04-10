package conversation

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/domain"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func GetConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	httputil.JSON(w, http.StatusOK, Conversation{ID: id, Messages: []domain.Message{}})
}

func CreateConversation(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusCreated, Conversation{ID: "new", Messages: []domain.Message{}})
}

func AddMessage(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusCreated, domain.Message{ID: "msg-1", Role: "user", Content: ""})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/conversations/{id}", GetConversation)
	mux.HandleFunc("POST /api/conversations", CreateConversation)
	mux.HandleFunc("POST /api/conversations/{id}/messages", AddMessage)
}
