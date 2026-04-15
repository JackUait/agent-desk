package contextusage

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeProjectLookup struct {
	path string
	ok   bool
}

func (f fakeProjectLookup) ProjectPath(id string) (string, bool) {
	return f.path, f.ok
}

func newTestHandler(runner *Runner, lookup ProjectPathLookup) *Handler {
	return NewHandler(runner, lookup, func(_ string) string { return "" })
}

func TestHandler_ReturnsParsedBreakdown(t *testing.T) {
	runner := &Runner{
		ClaudeBin: "claude",
		Exec: func(_ context.Context, _ string, _ []string, dir string) ([]byte, error) {
			if dir != "/projects/a" {
				t.Errorf("runner received dir %q, want /projects/a", dir)
			}
			return []byte(`{"result":"**Tokens:** 20.3k / 1m (0%)\n| Category | Tokens | Percentage |\n| System prompt | 6.8k | 0.7% |\n| Skills | 2.9k | 0.3% |\n"}`), nil
		},
	}
	h := newTestHandler(runner, fakeProjectLookup{path: "/projects/a", ok: true})

	req := httptest.NewRequest("GET", "/api/agent/context-usage?projectId=p1", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}
	var got Usage
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got.SystemPromptTokens != 6800 {
		t.Errorf("SystemPromptTokens = %d, want 6800", got.SystemPromptTokens)
	}
	if got.SkillsTokens != 2900 {
		t.Errorf("SkillsTokens = %d, want 2900", got.SkillsTokens)
	}
	if got.TotalTokens != 20300 {
		t.Errorf("TotalTokens = %d, want 20300", got.TotalTokens)
	}
}

func TestHandler_UnknownProject404(t *testing.T) {
	h := newTestHandler(&Runner{ClaudeBin: "claude"}, fakeProjectLookup{ok: false})
	req := httptest.NewRequest("GET", "/api/agent/context-usage?projectId=missing", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestHandler_MissingProjectIdParam400(t *testing.T) {
	h := newTestHandler(&Runner{ClaudeBin: "claude"}, fakeProjectLookup{ok: true})
	req := httptest.NewRequest("GET", "/api/agent/context-usage", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestHandler_CachesResultPerProject(t *testing.T) {
	calls := 0
	runner := &Runner{
		ClaudeBin: "claude",
		Exec: func(_ context.Context, _ string, _ []string, _ string) ([]byte, error) {
			calls++
			return []byte(`{"result":"**Tokens:** 1k / 200k (0%)\n| Category | Tokens | Percentage |\n| System prompt | 180 | 0% |\n"}`), nil
		},
	}
	h := newTestHandler(runner, fakeProjectLookup{path: "/p", ok: true})
	h.cacheTTL = time.Minute

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("GET", "/api/agent/context-usage?projectId=p1", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("iteration %d status = %d", i, rec.Code)
		}
	}
	if calls != 1 {
		t.Errorf("runner invoked %d times, want 1 (cached)", calls)
	}
}
