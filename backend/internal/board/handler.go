package board

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

var columnOrder = []struct {
	cardCol card.Column
	id      string
	title   string
}{
	{card.ColumnBacklog, "col-backlog", "Backlog"},
	{card.ColumnInProgress, "col-progress", "In Progress"},
	{card.ColumnReview, "col-review", "Review"},
	{card.ColumnDone, "col-done", "Done"},
}

type Handler struct {
	store *card.Store
}

func NewHandler(store *card.Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) GetBoard(w http.ResponseWriter, r *http.Request) {
	cards := h.store.List()

	byCol := make(map[card.Column][]string)
	for _, c := range cards {
		byCol[c.Column] = append(byCol[c.Column], c.ID)
	}

	cols := make([]ColumnResponse, 0, len(columnOrder))
	for _, col := range columnOrder {
		ids := byCol[col.cardCol]
		if ids == nil {
			ids = []string{}
		}
		cols = append(cols, ColumnResponse{
			ID:      col.id,
			Title:   col.title,
			CardIDs: ids,
		})
	}

	httputil.JSON(w, http.StatusOK, BoardResponse{
		ID:      "main",
		Title:   "Agent Desk",
		Columns: cols,
	})
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/board", h.GetBoard)
}
