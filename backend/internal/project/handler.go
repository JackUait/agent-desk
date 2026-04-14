package project

import (
	"encoding/json"
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

// Cascade hands project deletion off to card/worktree cleanup.
type Cascade interface {
	DeleteByProject(projectID string)
}

// FolderPicker is the minimal interface the handler needs from a picker.
type FolderPicker interface {
	Pick() (string, bool, error)
}

type Handler struct {
	store   *Store
	picker  FolderPicker
	cascade Cascade
}

func NewHandler(store *Store, picker FolderPicker, cascade Cascade) *Handler {
	return &Handler{store: store, picker: picker, cascade: cascade}
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	projects := h.store.List()
	if projects == nil {
		projects = []Project{}
	}
	httputil.JSON(w, http.StatusOK, projects)
}

func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Path == "" {
		httputil.Error(w, http.StatusBadRequest, "path is required")
		return
	}
	p, err := h.store.Create(body.Path)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, p)
}

func (h *Handler) RenameProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Title == "" {
		httputil.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	if !h.store.UpdateTitle(id, body.Title) {
		httputil.Error(w, http.StatusNotFound, "project not found")
		return
	}
	p, _ := h.store.Get(id)
	httputil.JSON(w, http.StatusOK, p)
}

func (h *Handler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok := h.store.Get(id); !ok {
		httputil.Error(w, http.StatusNotFound, "project not found")
		return
	}
	h.cascade.DeleteByProject(id)
	h.store.Delete(id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PickFolder(w http.ResponseWriter, r *http.Request) {
	path, cancelled, err := h.picker.Pick()
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{
		"path":      path,
		"cancelled": cancelled,
	})
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/projects", h.ListProjects)
	mux.HandleFunc("POST /api/projects", h.CreateProject)
	mux.HandleFunc("PATCH /api/projects/{id}", h.RenameProject)
	mux.HandleFunc("DELETE /api/projects/{id}", h.DeleteProject)
	mux.HandleFunc("POST /api/projects/pick-folder", h.PickFolder)
}
