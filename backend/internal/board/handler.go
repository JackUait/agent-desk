package board

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func HandleListBoards() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, []Board{})
	})
}

func HandleGetBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Placeholder"})
	})
}

func HandleCreateBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, Board{ID: "new", Title: "New Board"})
	})
}

func HandleUpdateBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Updated"})
	})
}

func HandleDeleteBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/boards", HandleListBoards())
	mux.Handle("GET /api/boards/{id}", HandleGetBoard())
	mux.Handle("POST /api/boards", HandleCreateBoard())
	mux.Handle("PUT /api/boards/{id}", HandleUpdateBoard())
	mux.Handle("DELETE /api/boards/{id}", HandleDeleteBoard())
}
