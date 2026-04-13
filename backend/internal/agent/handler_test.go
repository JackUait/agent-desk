package agent_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

func TestModelsHandler_ReturnsAllowedModels(t *testing.T) {
	mux := http.NewServeMux()
	h := agent.NewModelsHandler()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/models", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []agent.Model
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(got) != len(agent.AllowedModels) {
		t.Fatalf("expected %d models, got %d", len(agent.AllowedModels), len(got))
	}
	for i, m := range agent.AllowedModels {
		if got[i] != m {
			t.Errorf("model[%d] = %+v, want %+v", i, got[i], m)
		}
	}
}
