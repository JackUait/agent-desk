package board

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func ListBoards(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, []Board{})
}

func GetBoard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Placeholder"})
}

func CreateBoard(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusCreated, Board{ID: "new", Title: "New Board"})
}

func UpdateBoard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Updated"})
}

func DeleteBoard(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/boards", ListBoards)
	mux.HandleFunc("GET /api/boards/{id}", GetBoard)
	mux.HandleFunc("POST /api/boards", CreateBoard)
	mux.HandleFunc("PUT /api/boards/{id}", UpdateBoard)
	mux.HandleFunc("DELETE /api/boards/{id}", DeleteBoard)
}
