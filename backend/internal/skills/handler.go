package skills

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

// ProjectLookup is the minimal interface the handler needs to resolve a
// project's root path from its ID.
type ProjectLookup interface {
	ProjectPath(id string) (string, bool)
}

type Handler struct {
	projects ProjectLookup
}

func NewHandler(projects ProjectLookup) *Handler {
	return &Handler{projects: projects}
}

func (h *Handler) serviceForRequest(r *http.Request) (*Service, error) {
	return h.serviceForBody(r.URL.Query().Get("scope"), r.URL.Query().Get("projectId"))
}

func (h *Handler) serviceForBody(scope, projectID string) (*Service, error) {
	switch scope {
	case "global":
		return NewService(GlobalRoots()), nil
	case "project":
		if projectID == "" {
			return nil, errors.New("projectId required")
		}
		path, ok := h.projects.ProjectPath(projectID)
		if !ok {
			return nil, errors.New("project not found")
		}
		return NewService(ProjectRoots(path)), nil
	}
	return nil, errors.New("scope required")
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	items, err := svc.List()
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []Item{}
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) ReadContent(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	path := r.URL.Query().Get("path")
	c, err := svc.ReadContent(path)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

type writeBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
	Content   string `json:"content"`
}

func (h *Handler) WriteContent(w http.ResponseWriter, r *http.Request) {
	var body writeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	c, err := svc.WriteContent(body.Path, body.Content)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

type createBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Body      string `json:"body"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var body createBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	item, err := svc.Create(ItemKind(body.Kind), body.Name, body.Body)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, item)
}

type renameBody struct {
	Scope     string `json:"scope"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path"`
	NewName   string `json:"newName"`
}

func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var body renameBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	svc, err := h.serviceForBody(body.Scope, body.ProjectID)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	newPath, err := svc.Rename(body.Path, body.NewName)
	if err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"newPath": newPath})
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	svc, err := h.serviceForRequest(r)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	path := r.URL.Query().Get("path")
	if err := svc.Delete(path); err != nil {
		httputil.Error(w, classify(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/skills", h.List)
	mux.HandleFunc("GET /api/skills/content", h.ReadContent)
	mux.HandleFunc("PUT /api/skills/content", h.WriteContent)
	mux.HandleFunc("POST /api/skills", h.Create)
	mux.HandleFunc("POST /api/skills/rename", h.Rename)
	mux.HandleFunc("DELETE /api/skills", h.Delete)
}

// GlobalRoots returns roots under $HOME/.claude.
func GlobalRoots() Roots {
	home, _ := os.UserHomeDir()
	base := filepath.Join(home, ".claude")
	r := Roots{
		Writable: []string{
			filepath.Join(base, "skills"),
			filepath.Join(base, "commands"),
		},
	}
	r.Readable = append(r.Readable, discoverPluginRoots(filepath.Join(base, "plugins", "cache"))...)
	return r
}

// ProjectRoots returns roots under <projectPath>/.claude.
func ProjectRoots(projectPath string) Roots {
	base := filepath.Join(projectPath, ".claude")
	r := Roots{
		Writable: []string{
			filepath.Join(base, "skills"),
			filepath.Join(base, "commands"),
		},
	}
	r.Readable = append(r.Readable, discoverPluginRoots(filepath.Join(base, "plugins", "cache"))...)
	return r
}

func discoverPluginRoots(cacheDir string) []string {
	var out []string
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return out
	}
	for _, plugin := range entries {
		if !plugin.IsDir() {
			continue
		}
		versions, _ := os.ReadDir(filepath.Join(cacheDir, plugin.Name()))
		for _, v := range versions {
			if !v.IsDir() {
				continue
			}
			base := filepath.Join(cacheDir, plugin.Name(), v.Name())
			if st, err := os.Stat(filepath.Join(base, "skills")); err == nil && st.IsDir() {
				out = append(out, filepath.Join(base, "skills"))
			}
			if st, err := os.Stat(filepath.Join(base, "commands")); err == nil && st.IsDir() {
				out = append(out, filepath.Join(base, "commands"))
			}
		}
	}
	return out
}

func classify(err error) int {
	if errors.Is(err, ErrForbiddenPath) {
		return http.StatusForbidden
	}
	if errors.Is(err, ErrExists) {
		return http.StatusConflict
	}
	if errors.Is(err, os.ErrNotExist) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
