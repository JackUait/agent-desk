package card

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/worktree"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

type Handler struct {
	svc         *Service
	agentMgr    *agent.Manager
	worktreeSvc *worktree.Service
}

func NewHandler(svc *Service, agentMgr *agent.Manager, worktreeSvc *worktree.Service) *Handler {
	return &Handler{svc: svc, agentMgr: agentMgr, worktreeSvc: worktreeSvc}
}

func (h *Handler) CreateCard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProjectID string `json:"projectId"`
		Title     string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ProjectID == "" {
		httputil.Error(w, http.StatusBadRequest, "projectId is required")
		return
	}
	c := h.svc.CreateCard(body.ProjectID, body.Title)
	httputil.JSON(w, http.StatusCreated, c)
}

func (h *Handler) ListCards(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("projectId")
	if projectID == "" {
		httputil.Error(w, http.StatusBadRequest, "projectId query param is required")
		return
	}
	cards := h.svc.ListCards(projectID)
	httputil.JSON(w, http.StatusOK, cards)
}

func (h *Handler) GetCard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.svc.GetCard(id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handler) UpdateCard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var fields map[string]any
	if err := json.NewDecoder(r.Body).Decode(&fields); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	c, err := h.svc.UpdateFields(id, fields)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handler) DeleteCard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.DeleteCard(id); err != nil {
		httputil.Error(w, http.StatusNotFound, err.Error())
		return
	}
	// Best-effort cleanup: kill agent process.
	if killErr := h.agentMgr.Kill(id); killErr != nil {
		log.Printf("card: best-effort agent kill for %s: %v", id, killErr)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MergeCard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.svc.MoveToDone(id)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	// Best-effort cleanup: kill agent process and remove worktree.
	if killErr := h.agentMgr.Kill(id); killErr != nil {
		log.Printf("card: best-effort agent kill for %s: %v", id, killErr)
	}
	if rmErr := h.worktreeSvc.Remove(id); rmErr != nil {
		log.Printf("card: best-effort worktree remove for %s: %v", id, rmErr)
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	msgs, err := h.svc.ListMessages(id)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, msgs)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/cards", h.CreateCard)
	mux.HandleFunc("GET /api/cards", h.ListCards)
	mux.HandleFunc("GET /api/cards/{id}", h.GetCard)
	mux.HandleFunc("PATCH /api/cards/{id}", h.UpdateCard)
	mux.HandleFunc("DELETE /api/cards/{id}", h.DeleteCard)
	mux.HandleFunc("POST /api/cards/{id}/merge", h.MergeCard)
	mux.HandleFunc("GET /api/cards/{id}/messages", h.ListMessages)
}
