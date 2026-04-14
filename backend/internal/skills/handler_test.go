package skills

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

type fakeProjectLookup struct {
	byID map[string]string
}

func (f *fakeProjectLookup) ProjectPath(id string) (string, bool) {
	p, ok := f.byID[id]
	return p, ok
}

func TestHandlerListGlobal(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	skillsRoot := filepath.Join(tmp, ".claude", "skills")
	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: d\n---\nbody")

	h := NewHandler(&fakeProjectLookup{})
	req := httptest.NewRequest("GET", "/api/skills?scope=global", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []Item `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Items) != 1 || resp.Items[0].Name != "alpha" {
		t.Errorf("unexpected items: %+v", resp.Items)
	}
}

func TestHandlerListProject(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	projectPath := filepath.Join(tmp, "my-proj")
	writeFile(t, filepath.Join(projectPath, ".claude", "skills", "p", "SKILL.md"),
		"---\nname: p\n---\nbody")

	h := NewHandler(&fakeProjectLookup{byID: map[string]string{"proj-1": projectPath}})
	req := httptest.NewRequest("GET", "/api/skills?scope=project&projectId=proj-1", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Items []Item `json:"items"`
	}
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.Items) != 1 || resp.Items[0].Name != "p" {
		t.Errorf("unexpected: %+v", resp.Items)
	}
}

func TestHandlerContentReadWrite(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	skillFile := filepath.Join(tmp, ".claude", "skills", "a", "SKILL.md")
	writeFile(t, skillFile, "---\nname: a\n---\nbody")

	h := NewHandler(&fakeProjectLookup{})

	req := httptest.NewRequest("GET", "/api/skills/content?scope=global&path="+skillFile, nil)
	rec := httptest.NewRecorder()
	h.ReadContent(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("read status %d body %s", rec.Code, rec.Body.String())
	}

	newContent := "---\nname: a\ndescription: updated\n---\nnew body"
	body, _ := json.Marshal(map[string]string{
		"scope":   "global",
		"path":    skillFile,
		"content": newContent,
	})
	req = httptest.NewRequest("PUT", "/api/skills/content", bytes.NewReader(body))
	rec = httptest.NewRecorder()
	h.WriteContent(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("write status %d body %s", rec.Code, rec.Body.String())
	}
	raw, _ := os.ReadFile(skillFile)
	if string(raw) != newContent {
		t.Errorf("file mismatch: %s", string(raw))
	}
}

func TestHandlerRejectsWriteOutsideRoot(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	evil := filepath.Join(tmp, "evil.md")
	body, _ := json.Marshal(map[string]string{
		"scope":   "global",
		"path":    evil,
		"content": "pwn",
	})
	h := NewHandler(&fakeProjectLookup{})
	req := httptest.NewRequest("PUT", "/api/skills/content", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.WriteContent(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}
}
