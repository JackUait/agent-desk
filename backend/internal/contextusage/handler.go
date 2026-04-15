package contextusage

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

// ProjectPathLookup resolves a projectId to its absolute filesystem path. The
// handler uses this to pass `cd`-equivalent context to the Claude CLI.
type ProjectPathLookup interface {
	ProjectPath(id string) (string, bool)
}

// McpConfigResolver returns the mcp-config path that real agent sessions
// would use for a given projectId, or "" if none is active. Kept as a
// function so the handler does not depend on the websocket package.
type McpConfigResolver func(projectID string) string

// Handler serves GET /api/agent/context-usage?projectId=X.
type Handler struct {
	runner      *Runner
	projects    ProjectPathLookup
	mcpResolver McpConfigResolver

	cacheTTL time.Duration
	mu       sync.Mutex
	cache    map[string]cacheEntry
}

type cacheEntry struct {
	usage  Usage
	stored time.Time
}

// NewHandler wires the runner, project lookup, and mcp-config resolver into
// an HTTP handler. The cache TTL defaults to 60 seconds.
func NewHandler(runner *Runner, projects ProjectPathLookup, mcp McpConfigResolver) *Handler {
	return &Handler{
		runner:      runner,
		projects:    projects,
		mcpResolver: mcp,
		cacheTTL:    60 * time.Second,
		cache:       make(map[string]cacheEntry),
	}
}

// RegisterRoutes mounts GET /api/agent/context-usage on mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/agent/context-usage", h.ServeHTTP)
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("projectId")
	if projectID == "" {
		httputil.Error(w, http.StatusBadRequest, "projectId query param required")
		return
	}
	path, ok := h.projects.ProjectPath(projectID)
	if !ok {
		httputil.Error(w, http.StatusNotFound, "project not found")
		return
	}

	if cached, hit := h.cacheGet(projectID); hit {
		httputil.JSON(w, http.StatusOK, cached)
		return
	}

	mcpConfigPath := ""
	if h.mcpResolver != nil {
		mcpConfigPath = h.mcpResolver(projectID)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	usage, err := h.runner.Fetch(ctx, path, mcpConfigPath)
	if err != nil {
		httputil.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	h.cachePut(projectID, usage)
	httputil.JSON(w, http.StatusOK, usage)
}

func (h *Handler) cacheGet(projectID string) (Usage, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.cache[projectID]
	if !ok {
		return Usage{}, false
	}
	if time.Since(entry.stored) > h.cacheTTL {
		delete(h.cache, projectID)
		return Usage{}, false
	}
	return entry.usage, true
}

func (h *Handler) cachePut(projectID string, u Usage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cache[projectID] = cacheEntry{usage: u, stored: time.Now()}
}
