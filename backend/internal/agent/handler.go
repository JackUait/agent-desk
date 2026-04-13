package agent

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

// ModelsHandler serves the GET /api/models endpoint.
type ModelsHandler struct{}

// NewModelsHandler returns a ModelsHandler.
func NewModelsHandler() *ModelsHandler { return &ModelsHandler{} }

// ServeHTTP writes the AllowedModels list as JSON.
func (h *ModelsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	httputil.JSON(w, http.StatusOK, AllowedModels)
}

// RegisterRoutes mounts GET /api/models on mux.
func (h *ModelsHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/models", h.ServeHTTP)
}
