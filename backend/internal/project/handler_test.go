package project_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/project"
)

// --- test helpers ---

type fakePicker struct {
	path      string
	cancelled bool
	err       error
}

func (f fakePicker) Pick() (string, bool, error) { return f.path, f.cancelled, f.err }

type recordingCascade struct{ called []string }

func (r *recordingCascade) DeleteByProject(id string) { r.called = append(r.called, id) }

type noopCascade struct{}

func (noopCascade) DeleteByProject(string) {}

func newTestHandler(picker project.FolderPicker, cascade project.Cascade) (*project.Handler, *project.Store) {
	store := project.NewStore(&project.StubGit{IsRepoVal: true})
	h := project.NewHandler(store, picker, cascade)
	return h, store
}

// --- tests ---

func TestHandler_ListProjects_Empty(t *testing.T) {
	h, _ := newTestHandler(fakePicker{}, noopCascade{})

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	w := httptest.NewRecorder()
	h.ListProjects(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var got []project.Project
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestHandler_CreateProject_Creates(t *testing.T) {
	h, store := newTestHandler(fakePicker{}, noopCascade{})

	body := bytes.NewBufferString(`{"path":"/tmp/abc"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects", body)
	w := httptest.NewRecorder()
	h.CreateProject(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", w.Code)
	}

	var got project.Project
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID == "" {
		t.Error("expected non-empty ID")
	}
	if got.Path != "/tmp/abc" {
		t.Errorf("path = %q, want /tmp/abc", got.Path)
	}
	if len(store.List()) != 1 {
		t.Errorf("store len = %d, want 1", len(store.List()))
	}
}

func TestHandler_CreateProject_400OnBadBody(t *testing.T) {
	h, _ := newTestHandler(fakePicker{}, noopCascade{})

	body := bytes.NewBufferString(`not-json`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects", body)
	w := httptest.NewRecorder()
	h.CreateProject(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestHandler_CreateProject_400OnEmptyPath(t *testing.T) {
	h, _ := newTestHandler(fakePicker{}, noopCascade{})

	body := bytes.NewBufferString(`{"path":""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects", body)
	w := httptest.NewRecorder()
	h.CreateProject(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}

func TestHandler_RenameProject(t *testing.T) {
	h, store := newTestHandler(fakePicker{}, noopCascade{})
	p, _ := store.Create("/tmp/something")

	body := bytes.NewBufferString(`{"title":"New Name"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/projects/"+p.ID, body)
	req.SetPathValue("id", p.ID)
	w := httptest.NewRecorder()
	h.RenameProject(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var got project.Project
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Title != "New Name" {
		t.Errorf("title = %q, want %q", got.Title, "New Name")
	}
}

func TestHandler_RenameProject_404(t *testing.T) {
	h, _ := newTestHandler(fakePicker{}, noopCascade{})

	body := bytes.NewBufferString(`{"title":"Whatever"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/projects/ghost", body)
	req.SetPathValue("id", "ghost")
	w := httptest.NewRecorder()
	h.RenameProject(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestHandler_RenameProject_400OnEmptyTitle(t *testing.T) {
	store := project.NewStore(&project.StubGit{IsRepoVal: true})
	h := project.NewHandler(store, fakePicker{}, noopCascade{})
	p, _ := store.Create("/tmp/x")
	req := httptest.NewRequest("PATCH", "/api/projects/"+p.ID, bytes.NewBufferString(`{"title":""}`))
	req.SetPathValue("id", p.ID)
	rec := httptest.NewRecorder()
	h.RenameProject(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	got, _ := store.Get(p.ID)
	if got.Title == "" {
		t.Error("title should not have been overwritten")
	}
}

func TestHandler_DeleteProject_CascadesAndReturns204(t *testing.T) {
	cascade := &recordingCascade{}
	h, store := newTestHandler(fakePicker{}, cascade)
	p, _ := store.Create("/tmp/something")

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/"+p.ID, nil)
	req.SetPathValue("id", p.ID)
	w := httptest.NewRecorder()
	h.DeleteProject(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", w.Code)
	}

	if len(cascade.called) != 1 || cascade.called[0] != p.ID {
		t.Errorf("cascade called with %v, want [%s]", cascade.called, p.ID)
	}

	if _, ok := store.Get(p.ID); ok {
		t.Error("expected project to be deleted from store")
	}
}

func TestHandler_DeleteProject_404(t *testing.T) {
	h, _ := newTestHandler(fakePicker{}, noopCascade{})

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/ghost", nil)
	req.SetPathValue("id", "ghost")
	w := httptest.NewRecorder()
	h.DeleteProject(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}
}

func TestHandler_PickFolder_ReturnsPath(t *testing.T) {
	picker := fakePicker{path: "/home/user/myproject", cancelled: false}
	h, _ := newTestHandler(picker, noopCascade{})

	req := httptest.NewRequest(http.MethodPost, "/api/projects/pick-folder", nil)
	w := httptest.NewRecorder()
	h.PickFolder(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var got map[string]any
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["path"] != "/home/user/myproject" {
		t.Errorf("path = %v, want /home/user/myproject", got["path"])
	}
	if got["cancelled"] != false {
		t.Errorf("cancelled = %v, want false", got["cancelled"])
	}
}

func TestHandler_PickFolder_Cancelled(t *testing.T) {
	picker := fakePicker{path: "", cancelled: true}
	h, _ := newTestHandler(picker, noopCascade{})

	req := httptest.NewRequest(http.MethodPost, "/api/projects/pick-folder", nil)
	w := httptest.NewRecorder()
	h.PickFolder(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var got map[string]any
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["cancelled"] != true {
		t.Errorf("cancelled = %v, want true", got["cancelled"])
	}
}
