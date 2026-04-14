# Card edit + attachments + dirty-flag notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a card's title, description, and attach arbitrary files to it, with the agent getting a structured "what the user changed" note on the next turn whenever user edits are pending.

**Architecture:** Per-card attachment directory under `~/.agent-desk/cards/{cardId}/attachments/` with a `manifest.json`. New `attachment` backend package, new REST routes, two new MCP tools (`list_attachments`, `read_attachment`). Source-aware `card.Service` mutations so only user-originating edits set dirty flags; `DrainDirty` runs in the WS chat pipeline and wraps the outgoing user message in a `<card-edits-since-last-turn>` block. Frontend gets editable title/description fields (500 ms debounce auto-save) and an attachment list/dropzone.

**Tech Stack:** Go stdlib `net/http`, existing `card`/`mcp`/`agent`/`websocket` packages, React + TypeScript + Vite, CSS Modules, Base-UI Dialog, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-14-card-edit-attachments-design.md`

**Parallelism note:** Task groups A, B, C, D, E below map to independent packages and can be dispatched to parallel subagents. Group F (frontend wiring) depends on A and B REST shapes being merged.

---

## File structure

### New files (backend)

| Path | Responsibility |
|---|---|
| `backend/internal/attachment/attachment.go` | `Attachment` type, storage-root helper, limits constants |
| `backend/internal/attachment/store.go` | Per-card dir + atomic manifest read/write |
| `backend/internal/attachment/store_test.go` | Store unit tests |
| `backend/internal/attachment/service.go` | `Upload`, `List`, `Read`, `Delete` with limit enforcement |
| `backend/internal/attachment/service_test.go` | Service unit tests |
| `backend/internal/attachment/handler.go` | REST handlers + routes |
| `backend/internal/attachment/handler_test.go` | Handler integration tests |

### New files (frontend)

| Path | Responsibility |
|---|---|
| `frontend/src/features/card/EditableTitle.tsx` | Click-in-place editable title with 500 ms debounce auto-save |
| `frontend/src/features/card/EditableTitle.test.tsx` | Behavior tests with fake timers |
| `frontend/src/features/card/EditableDescription.tsx` | Editable description (textarea ↔ markdown) with debounce |
| `frontend/src/features/card/EditableDescription.test.tsx` | Behavior tests |
| `frontend/src/features/card/AttachmentList.tsx` | List, upload dropzone, delete, error toast |
| `frontend/src/features/card/AttachmentList.test.tsx` | Behavior tests |

### Modified files (backend)

| Path | What changes |
|---|---|
| `backend/internal/card/card.go` | Add `Attachments []attachment.Attachment` and in-memory `DirtyFlags []string` |
| `backend/internal/card/service.go` | Add `MarkDirty`, `DrainDirty`, and `UpdateFieldsFromAgent` companion; existing public `UpdateFields` keeps "user" semantics |
| `backend/internal/card/handler.go` | `UpdateCard` keeps user semantics (already `UpdateFields`); no change in behavior, just tests |
| `backend/internal/mcp/mutator.go` | Extend `CardMutator` with `UpdateFieldsFromAgent` + new attachment-mutator methods for `SetAttachments` drain-free path (not needed if mcp just reads) |
| `backend/internal/mcp/handlers.go` | `SetTitle`, `SetDescription`, etc. route through `UpdateFieldsFromAgent`; add `ListAttachments`, `ReadAttachment` handlers |
| `backend/internal/mcp/server.go` | Register `mcp__agent_desk__list_attachments` and `mcp__agent_desk__read_attachment` |
| `backend/internal/agent/wrap.go` (new) | Pure helper: `WrapUserMessage(msg string, flags []string, diff AttachmentDiff) string` |
| `backend/internal/agent/wrap_test.go` (new) | Unit tests for the wrapper |
| `backend/internal/websocket/handler.go` | Call `cardSvc.DrainDirty` before `manager.Send`, pass through `WrapUserMessage` |
| `backend/cmd/server/main.go` | Wire new attachment handler + service, pass attachment service into card service for in-card listings |

### Modified files (frontend)

| Path | What changes |
|---|---|
| `frontend/src/shared/types/domain.ts` | Add `Attachment` type, extend `Card` with `attachments: Attachment[]` |
| `frontend/src/shared/api/client.ts` | Add `updateCard`, `uploadAttachment`, `deleteAttachment`, `attachmentUrl` |
| `frontend/src/shared/api/client.test.ts` | Contract tests for the new endpoints |
| `frontend/src/features/project/use-projects.ts` | `updateCard` goes through `api.updateCard` |
| `frontend/src/features/card/CardContent.tsx` | Swap static title/description for `EditableTitle` / `EditableDescription`; add `AttachmentList`; accept new `onUpdate` / `onUpload` / `onDelete` props |
| `frontend/src/features/card/CardContent.test.tsx` | Update tests to exercise edit + attachment flows |
| `frontend/src/features/card/CardModal.tsx` | Plumb `onUpdate` / `onUpload` / `onDelete` props to `CardContent` |
| `frontend/src/features/project/ProjectsPage.tsx` | Pass update/upload/delete handlers into `CardModal` |

---

## Task Group A — Attachment backend (independent subagent)

### Task A1: `Attachment` type + limits constants

**Files:**
- Create: `backend/internal/attachment/attachment.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/attachment/attachment_test.go`:

```go
package attachment

import "testing"

func TestLimitsAreWhatSpecSays(t *testing.T) {
	if MaxFileBytes != 10*1024*1024 {
		t.Fatalf("MaxFileBytes = %d, want %d", MaxFileBytes, 10*1024*1024)
	}
	if MaxFilesPerCard != 20 {
		t.Fatalf("MaxFilesPerCard = %d, want 20", MaxFilesPerCard)
	}
	if MaxTotalBytes != 50*1024*1024 {
		t.Fatalf("MaxTotalBytes = %d, want %d", MaxTotalBytes, 50*1024*1024)
	}
}

func TestAttachmentJSONShape(t *testing.T) {
	a := Attachment{Name: "x.txt", Size: 4, MIMEType: "text/plain", UploadedAt: 7}
	if a.Name != "x.txt" || a.Size != 4 || a.MIMEType != "text/plain" || a.UploadedAt != 7 {
		t.Fatalf("unexpected: %+v", a)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/attachment/...`
Expected: FAIL — package `attachment` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/attachment/attachment.go`:

```go
package attachment

// Attachment is the manifest entry for a single file attached to a card.
type Attachment struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	MIMEType   string `json:"mimeType"`
	UploadedAt int64  `json:"uploadedAt"`
}

// AttachmentDiff captures the net change between two manifest snapshots.
type AttachmentDiff struct {
	Added   []Attachment
	Removed []string // filenames
}

const (
	MaxFileBytes    int64 = 10 * 1024 * 1024
	MaxFilesPerCard       = 20
	MaxTotalBytes   int64 = 50 * 1024 * 1024
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/attachment/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/attachment/attachment.go backend/internal/attachment/attachment_test.go
git commit -m "feat(attachment): define Attachment type and limits"
```

---

### Task A2: Per-card attachment store (disk + manifest)

**Files:**
- Create: `backend/internal/attachment/store.go`
- Create: `backend/internal/attachment/store_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/attachment/store_test.go`:

```go
package attachment

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreRoundTrip(t *testing.T) {
	root := t.TempDir()
	s := NewStore(root)

	a := Attachment{Name: "notes.txt", Size: 5, MIMEType: "text/plain", UploadedAt: 42}
	if err := s.Put("card-1", a, []byte("hello")); err != nil {
		t.Fatalf("Put: %v", err)
	}

	entries, err := s.List("card-1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "notes.txt" {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	data, mime, err := s.Read("card-1", "notes.txt")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if string(data) != "hello" || mime != "text/plain" {
		t.Fatalf("unexpected data=%q mime=%q", data, mime)
	}

	p := filepath.Join(root, "card-1", "attachments", "notes.txt")
	if _, statErr := os.Stat(p); statErr != nil {
		t.Fatalf("expected file at %s: %v", p, statErr)
	}

	if err := s.Delete("card-1", "notes.txt"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	entries, _ = s.List("card-1")
	if len(entries) != 0 {
		t.Fatalf("expected empty after delete, got %+v", entries)
	}
	if _, statErr := os.Stat(p); !os.IsNotExist(statErr) {
		t.Fatalf("expected file removed, stat err = %v", statErr)
	}
}

func TestStoreListMissingCard(t *testing.T) {
	s := NewStore(t.TempDir())
	entries, err := s.List("nope")
	if err != nil {
		t.Fatalf("List on missing card should be nil error, got %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty slice, got %+v", entries)
	}
}

func TestStoreRejectsTraversal(t *testing.T) {
	s := NewStore(t.TempDir())
	err := s.Put("card-x", Attachment{Name: "../escape.txt"}, []byte("no"))
	if err == nil {
		t.Fatalf("expected error on traversal, got nil")
	}
}

func TestStoreRejectsCollision(t *testing.T) {
	s := NewStore(t.TempDir())
	_ = s.Put("card-x", Attachment{Name: "a.txt", Size: 1, MIMEType: "text/plain"}, []byte("a"))
	err := s.Put("card-x", Attachment{Name: "a.txt", Size: 1, MIMEType: "text/plain"}, []byte("a"))
	if err == nil {
		t.Fatalf("expected collision error")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/attachment/...`
Expected: FAIL — `NewStore`/`Put`/`List`/`Read`/`Delete` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/attachment/store.go`:

```go
package attachment

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	ErrInvalidName      = errors.New("attachment: invalid filename")
	ErrFileExists       = errors.New("attachment: filename already exists")
	ErrNotFound         = errors.New("attachment: not found")
	ErrManifestCorrupt  = errors.New("attachment: manifest corrupt")
)

// Store persists attachment files and a per-card manifest to disk.
type Store struct {
	root string
	mu   sync.Mutex
}

func NewStore(root string) *Store {
	return &Store{root: root}
}

func (s *Store) cardDir(cardID string) string {
	return filepath.Join(s.root, cardID, "attachments")
}

func (s *Store) manifestPath(cardID string) string {
	return filepath.Join(s.cardDir(cardID), "manifest.json")
}

func validName(name string) bool {
	if name == "" {
		return false
	}
	if strings.ContainsAny(name, "/\\\x00") {
		return false
	}
	if name == "." || name == ".." || strings.Contains(name, "..") {
		return false
	}
	return true
}

func (s *Store) readManifest(cardID string) ([]Attachment, error) {
	path := s.manifestPath(cardID)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return []Attachment{}, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Attachment
	if jsonErr := json.Unmarshal(b, &out); jsonErr != nil {
		return []Attachment{}, nil
	}
	return out, nil
}

func (s *Store) writeManifest(cardID string, entries []Attachment) error {
	if err := os.MkdirAll(s.cardDir(cardID), 0o755); err != nil {
		return err
	}
	tmp := s.manifestPath(cardID) + ".tmp"
	b, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.manifestPath(cardID))
}

// Put writes bytes + appends a manifest entry. Caller sets Name/Size/MIMEType/UploadedAt.
func (s *Store) Put(cardID string, a Attachment, data []byte) error {
	if !validName(a.Name) {
		return ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := s.readManifest(cardID)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Name == a.Name {
			return fmt.Errorf("%w: %s", ErrFileExists, a.Name)
		}
	}
	if err := os.MkdirAll(s.cardDir(cardID), 0o755); err != nil {
		return err
	}
	path := filepath.Join(s.cardDir(cardID), a.Name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return err
	}
	entries = append(entries, a)
	return s.writeManifest(cardID, entries)
}

func (s *Store) List(cardID string) ([]Attachment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readManifest(cardID)
}

func (s *Store) Read(cardID, name string) ([]byte, string, error) {
	if !validName(name) {
		return nil, "", ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := s.readManifest(cardID)
	if err != nil {
		return nil, "", err
	}
	var mime string
	found := false
	for _, e := range entries {
		if e.Name == name {
			mime = e.MIMEType
			found = true
			break
		}
	}
	if !found {
		return nil, "", ErrNotFound
	}
	data, err := os.ReadFile(filepath.Join(s.cardDir(cardID), name))
	if errors.Is(err, os.ErrNotExist) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return data, mime, nil
}

func (s *Store) Delete(cardID, name string) error {
	if !validName(name) {
		return ErrInvalidName
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := s.readManifest(cardID)
	if err != nil {
		return err
	}
	kept := entries[:0]
	found := false
	for _, e := range entries {
		if e.Name == name {
			found = true
			continue
		}
		kept = append(kept, e)
	}
	if !found {
		return ErrNotFound
	}
	path := filepath.Join(s.cardDir(cardID), name)
	if rmErr := os.Remove(path); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
		return rmErr
	}
	return s.writeManifest(cardID, kept)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/attachment/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/attachment/store.go backend/internal/attachment/store_test.go
git commit -m "feat(attachment): per-card disk store with manifest"
```

---

### Task A3: `Service` with upload limits + MIME detection

**Files:**
- Create: `backend/internal/attachment/service.go`
- Create: `backend/internal/attachment/service_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/attachment/service_test.go`:

```go
package attachment

import (
	"bytes"
	"strings"
	"testing"
)

func newSvc(t *testing.T) *Service {
	t.Helper()
	return NewService(NewStore(t.TempDir()), func() int64 { return 100 })
}

func TestUploadSuccess(t *testing.T) {
	s := newSvc(t)
	a, err := s.Upload("c1", "hello.txt", bytes.NewReader([]byte("hi there")))
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}
	if a.Name != "hello.txt" || a.Size != int64(len("hi there")) {
		t.Fatalf("unexpected: %+v", a)
	}
	if !strings.HasPrefix(a.MIMEType, "text/") {
		t.Fatalf("unexpected mime: %q", a.MIMEType)
	}
	if a.UploadedAt != 100 {
		t.Fatalf("UploadedAt = %d, want 100", a.UploadedAt)
	}
}

func TestUploadRejectsOversize(t *testing.T) {
	s := newSvc(t)
	big := bytes.NewReader(make([]byte, MaxFileBytes+1))
	_, err := s.Upload("c1", "big.bin", big)
	if err == nil {
		t.Fatalf("expected oversize error")
	}
	if err != ErrFileTooLarge {
		t.Fatalf("err = %v, want ErrFileTooLarge", err)
	}
}

func TestUploadRejectsAtFileCountCap(t *testing.T) {
	s := newSvc(t)
	for i := 0; i < MaxFilesPerCard; i++ {
		name := "f" + string(rune('a'+i)) + ".txt"
		if _, err := s.Upload("c1", name, bytes.NewReader([]byte("x"))); err != nil {
			t.Fatalf("Upload %d: %v", i, err)
		}
	}
	_, err := s.Upload("c1", "overflow.txt", bytes.NewReader([]byte("x")))
	if err != ErrTooManyFiles {
		t.Fatalf("err = %v, want ErrTooManyFiles", err)
	}
}

func TestUploadRejectsTotalQuota(t *testing.T) {
	s := newSvc(t)
	chunk := make([]byte, MaxFileBytes)
	for i := 0; i < 5; i++ {
		name := "blob" + string(rune('0'+i)) + ".bin"
		if _, err := s.Upload("c1", name, bytes.NewReader(chunk)); err != nil {
			t.Fatalf("Upload %d: %v", i, err)
		}
	}
	_, err := s.Upload("c1", "overflow.bin", bytes.NewReader(chunk))
	if err != ErrQuotaExceeded {
		t.Fatalf("err = %v, want ErrQuotaExceeded", err)
	}
}

func TestUploadSanitizesTraversal(t *testing.T) {
	s := newSvc(t)
	_, err := s.Upload("c1", "../escape.txt", bytes.NewReader([]byte("x")))
	if err != ErrInvalidName {
		t.Fatalf("err = %v, want ErrInvalidName", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/attachment/...`
Expected: FAIL — no `Service`, `ErrFileTooLarge`, etc.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/attachment/service.go`:

```go
package attachment

import (
	"errors"
	"io"
	"net/http"
)

var (
	ErrFileTooLarge  = errors.New("attachment: file too large")
	ErrTooManyFiles  = errors.New("attachment: too many attachments")
	ErrQuotaExceeded = errors.New("attachment: quota exceeded")
)

// NowFunc returns the current unix time; injected for tests.
type NowFunc func() int64

// Service is the upload/list/read/delete policy layer above Store.
type Service struct {
	store *Store
	now   NowFunc
}

func NewService(store *Store, now NowFunc) *Service {
	return &Service{store: store, now: now}
}

// Upload reads r in full, enforces limits, stores the bytes, and returns the
// manifest entry it wrote.
func (s *Service) Upload(cardID, name string, r io.Reader) (Attachment, error) {
	if !validName(name) {
		return Attachment{}, ErrInvalidName
	}

	limited := io.LimitReader(r, MaxFileBytes+1)
	buf, err := io.ReadAll(limited)
	if err != nil {
		return Attachment{}, err
	}
	if int64(len(buf)) > MaxFileBytes {
		return Attachment{}, ErrFileTooLarge
	}

	existing, err := s.store.List(cardID)
	if err != nil {
		return Attachment{}, err
	}
	if len(existing) >= MaxFilesPerCard {
		return Attachment{}, ErrTooManyFiles
	}
	var total int64
	for _, e := range existing {
		total += e.Size
	}
	if total+int64(len(buf)) > MaxTotalBytes {
		return Attachment{}, ErrQuotaExceeded
	}

	mime := http.DetectContentType(buf)
	a := Attachment{
		Name:       name,
		Size:       int64(len(buf)),
		MIMEType:   mime,
		UploadedAt: s.now(),
	}
	if putErr := s.store.Put(cardID, a, buf); putErr != nil {
		return Attachment{}, putErr
	}
	return a, nil
}

func (s *Service) List(cardID string) ([]Attachment, error) {
	return s.store.List(cardID)
}

func (s *Service) Read(cardID, name string) ([]byte, string, error) {
	return s.store.Read(cardID, name)
}

func (s *Service) Delete(cardID, name string) error {
	return s.store.Delete(cardID, name)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/attachment/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/attachment/service.go backend/internal/attachment/service_test.go
git commit -m "feat(attachment): service with upload limits + mime detection"
```

---

### Task A4: REST handler + routes

**Files:**
- Create: `backend/internal/attachment/handler.go`
- Create: `backend/internal/attachment/handler_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/attachment/handler_test.go`:

```go
package attachment

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newHandler(t *testing.T) *Handler {
	t.Helper()
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	return NewHandler(svc)
}

func multipartUpload(t *testing.T, name, content string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", name)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	fw.Write([]byte(content))
	mw.Close()
	return &body, mw.FormDataContentType()
}

func TestHandlerUploadCreated(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "readme.txt", "hello world")
	req := httptest.NewRequest("POST", "/api/cards/abc/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rr.Code)
	}
	var a Attachment
	if err := json.Unmarshal(rr.Body.Bytes(), &a); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if a.Name != "readme.txt" || a.Size != 11 {
		t.Fatalf("unexpected: %+v", a)
	}
}

func TestHandlerUploadTooLarge(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	big := strings.Repeat("x", int(MaxFileBytes+1))
	body, ct := multipartUpload(t, "big.bin", big)
	req := httptest.NewRequest("POST", "/api/cards/abc/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", rr.Code)
	}
}

func TestHandlerListDownloadDelete(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "note.txt", "hi")
	up := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	up.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, up)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d", rr.Code)
	}

	// download
	rr = httptest.NewRecorder()
	get := httptest.NewRequest("GET", "/api/cards/c1/attachments/note.txt", nil)
	mux.ServeHTTP(rr, get)
	if rr.Code != http.StatusOK {
		t.Fatalf("download status = %d", rr.Code)
	}
	if rr.Body.String() != "hi" {
		t.Fatalf("body = %q", rr.Body.String())
	}

	// delete
	rr = httptest.NewRecorder()
	del := httptest.NewRequest("DELETE", "/api/cards/c1/attachments/note.txt", nil)
	mux.ServeHTTP(rr, del)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rr.Code)
	}

	// download missing → 404
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, get)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("post-delete get = %d, want 404", rr.Code)
	}
}

func TestHandlerRejectsTraversal(t *testing.T) {
	h := newHandler(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "../oops.txt", "x")
	req := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/attachment/...`
Expected: FAIL — `NewHandler` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/attachment/handler.go`:

```go
package attachment

import (
	"encoding/json"
	"errors"
	"net/http"
)

// Handler exposes attachment routes.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/cards/{id}/attachments", h.upload)
	mux.HandleFunc("GET /api/cards/{id}/attachments/{name}", h.download)
	mux.HandleFunc("DELETE /api/cards/{id}/attachments/{name}", h.remove)
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	if err := r.ParseMultipartForm(MaxFileBytes + 1024); err != nil {
		writeErr(w, http.StatusBadRequest, "multipart parse failed")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	a, upErr := h.svc.Upload(cardID, header.Filename, file)
	if upErr != nil {
		status := statusFor(upErr)
		writeErr(w, status, upErr.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(a)
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	name := r.PathValue("name")
	data, mime, err := h.svc.Read(cardID, name)
	if err != nil {
		writeErr(w, statusFor(err), err.Error())
		return
	}
	w.Header().Set("Content-Type", mime)
	_, _ = w.Write(data)
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	name := r.PathValue("name")
	if err := h.svc.Delete(cardID, name); err != nil {
		writeErr(w, statusFor(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func statusFor(err error) int {
	switch {
	case errors.Is(err, ErrFileTooLarge):
		return http.StatusRequestEntityTooLarge
	case errors.Is(err, ErrTooManyFiles), errors.Is(err, ErrQuotaExceeded), errors.Is(err, ErrFileExists):
		return http.StatusConflict
	case errors.Is(err, ErrInvalidName):
		return http.StatusBadRequest
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/attachment/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/attachment/handler.go backend/internal/attachment/handler_test.go
git commit -m "feat(attachment): REST handler for upload/download/delete"
```

---

## Task Group B — `card` dirty flags + source-aware mutations (independent subagent)

### Task B1: `MarkDirty` + `DrainDirty` + source enum

**Files:**
- Modify: `backend/internal/card/card.go`
- Modify: `backend/internal/card/service.go`
- Create: `backend/internal/card/dirty_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/card/dirty_test.go`:

```go
package card

import (
	"reflect"
	"sort"
	"testing"
)

func newServiceForDirtyTest(t *testing.T) (*Service, Card) {
	t.Helper()
	svc := NewService(NewStore())
	c := svc.CreateCard("proj", "title")
	return svc, c
}

func TestDrainDirtyEmptyAtStart(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no flags, got %+v", flags)
	}
}

func TestUserUpdateMarksDirty(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, err := svc.UpdateFields(c.ID, map[string]any{
		"title":       "new title",
		"description": "new desc",
	})
	if err != nil {
		t.Fatalf("UpdateFields: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	sort.Strings(flags)
	want := []string{"description", "title"}
	if !reflect.DeepEqual(flags, want) {
		t.Fatalf("flags = %v, want %v", flags, want)
	}
}

func TestDrainClearsAfterRead(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, _ = svc.UpdateFields(c.ID, map[string]any{"title": "a"})
	_, _ = svc.DrainDirty(c.ID)
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected cleared, got %+v", flags)
	}
}

func TestAgentUpdateDoesNotMarkDirty(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, err := svc.UpdateFieldsFromAgent(c.ID, map[string]any{
		"title":       "agent title",
		"description": "agent desc",
	})
	if err != nil {
		t.Fatalf("UpdateFieldsFromAgent: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("agent update should not dirty, got %+v", flags)
	}
}

func TestMarkDirtyDedupes(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	svc.MarkDirty(c.ID, "attachments")
	svc.MarkDirty(c.ID, "attachments")
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 1 || flags[0] != "attachments" {
		t.Fatalf("unexpected flags %+v", flags)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/card/...`
Expected: FAIL — `DrainDirty`, `MarkDirty`, `UpdateFieldsFromAgent` undefined.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/internal/card/service.go`. Add at the top of the file (near the struct):

```go
type source int

const (
	sourceUser source = iota
	sourceAgent
)
```

Add dirty-flag storage on `Service`. Replace the existing `Service` struct:

```go
type Service struct {
	store *Store

	dirtyMu sync.Mutex
	dirty   map[string]map[string]struct{} // cardID -> flagSet
}

func NewService(store *Store) *Service {
	return &Service{
		store: store,
		dirty: make(map[string]map[string]struct{}),
	}
}
```

Add `sync` to imports. Add these methods at the bottom of the file:

```go
// MarkDirty records that the user mutated `flag` on `id`. Safe to call multiple
// times; later calls are idempotent per flag.
func (s *Service) MarkDirty(id, flag string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	set, ok := s.dirty[id]
	if !ok {
		set = make(map[string]struct{})
		s.dirty[id] = set
	}
	set[flag] = struct{}{}
}

// DrainDirty returns the current flag set for id and clears it.
// The second return value is reserved for the attachment diff and is empty
// for now; it will be populated in task D2.
func (s *Service) DrainDirty(id string) ([]string, any) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	set := s.dirty[id]
	if len(set) == 0 {
		return nil, nil
	}
	out := make([]string, 0, len(set))
	for f := range set {
		out = append(out, f)
	}
	delete(s.dirty, id)
	return out, nil
}

// UpdateFieldsFromAgent is the same as UpdateFields but does not mark
// the card dirty. Called by MCP handlers so agent self-edits don't feed
// back into the dirty stream.
func (s *Service) UpdateFieldsFromAgent(id string, fields map[string]any) (Card, error) {
	return s.updateFieldsWithSource(id, fields, sourceAgent)
}
```

Refactor `UpdateFields` to call `updateFieldsWithSource(sourceUser)`:

```go
func (s *Service) UpdateFields(id string, fields map[string]any) (Card, error) {
	return s.updateFieldsWithSource(id, fields, sourceUser)
}

func (s *Service) updateFieldsWithSource(id string, fields map[string]any, src source) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	for k, v := range fields {
		switch k {
		case "title":
			if str, ok := v.(string); ok {
				c.Title = str
				if src == sourceUser {
					s.MarkDirty(id, "title")
				}
			}
		case "description":
			if str, ok := v.(string); ok {
				c.Description = str
				if src == sourceUser {
					s.MarkDirty(id, "description")
				}
			}
		case "complexity":
			if str, ok := v.(string); ok {
				c.Complexity = str
			}
		case "acceptanceCriteria":
			if sl, ok := toStringSlice(v); ok {
				c.AcceptanceCriteria = sl
			}
		case "relevantFiles":
			if sl, ok := toStringSlice(v); ok {
				c.RelevantFiles = sl
			}
		case "labels":
			if sl, ok := toStringSlice(v); ok {
				c.Labels = sl
			}
		}
	}
	s.touch(&c)
	return c, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/card/...`
Expected: PASS (new dirty tests plus all existing card tests still green).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/service.go backend/internal/card/dirty_test.go
git commit -m "feat(card): source-aware mutations + dirty flag drain"
```

---

### Task B2: Widen `CardMutator` in MCP and route `set_title` / `set_description` through the agent-source path

**Files:**
- Modify: `backend/internal/mcp/mutator.go`
- Modify: `backend/internal/mcp/handlers.go`
- Modify: `backend/internal/mcp/handlers_test.go`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/internal/mcp/handlers_test.go`:

```go
func TestSetTitleDoesNotDirtyCard(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "original")

	h := NewHandlers(svc)
	_, err := h.SetTitle(context.Background(), c.ID, map[string]any{"title": "agent chose this"})
	if err != nil {
		t.Fatalf("SetTitle: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no dirty flags after MCP SetTitle, got %+v", flags)
	}
}

func TestSetDescriptionDoesNotDirtyCard(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")

	h := NewHandlers(svc)
	_, err := h.SetDescription(context.Background(), c.ID, map[string]any{"description": "agent body"})
	if err != nil {
		t.Fatalf("SetDescription: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no dirty flags after MCP SetDescription, got %+v", flags)
	}
}
```

Add `"context"` and `"github.com/jackuait/agent-desk/backend/internal/card"` imports if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/mcp/...`
Expected: FAIL — `SetTitle` currently dirties the card.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/internal/mcp/mutator.go` to add:

```go
type CardMutator interface {
	GetCard(id string) (card.Card, error)
	UpdateFieldsFromAgent(id string, fields map[string]any) (card.Card, error)
	SetColumn(id string, target card.Column) (card.Card, error)
	SetSummary(id, summary string) (card.Card, error)
	SetBlocked(id, reason string) (card.Card, error)
	ClearBlocked(id string) (card.Card, error)
	SetProgress(id string, step, totalSteps int, currentStep string) (card.Card, error)
	ClearProgress(id string) (card.Card, error)
	AddLabel(id, label string) (card.Card, error)
	RemoveLabel(id, label string) (card.Card, error)
	AddAcceptanceCriterion(id, text string) (card.Card, error)
	RemoveAcceptanceCriterion(id string, index int) (card.Card, error)
}
```

(Replace the existing `UpdateFields` entry with `UpdateFieldsFromAgent`.)

Edit `backend/internal/mcp/handlers.go`. Find every `UpdateFields` call inside the MCP handler implementations (at minimum `SetTitle`, `SetDescription`, and `SetComplexity` if it uses the same path) and replace with `UpdateFieldsFromAgent`. Example patch:

```go
func (h *Handlers) SetTitle(ctx context.Context, cardID string, args map[string]any) (ToolResult, error) {
	title, _ := args["title"].(string)
	if _, err := h.mutator.UpdateFieldsFromAgent(cardID, map[string]any{"title": title}); err != nil {
		return ToolResult{IsError: true, Message: err.Error()}, nil
	}
	return ToolResult{Message: "ok"}, nil
}
```

Apply the same rename to `SetDescription`, `SetComplexity`, and any other MCP handler that previously used `UpdateFields`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/mcp/... ./internal/card/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/mutator.go backend/internal/mcp/handlers.go backend/internal/mcp/handlers_test.go
git commit -m "feat(mcp): route agent mutations through UpdateFieldsFromAgent"
```

---

## Task Group C — Attachment-aware dirty flags + drain payload (depends on A + B)

### Task C1: Include attachment diff in `DrainDirty` return

**Files:**
- Modify: `backend/internal/card/service.go`
- Modify: `backend/internal/card/dirty_test.go`

- [ ] **Step 1: Write the failing test**

Append to `backend/internal/card/dirty_test.go`:

```go
func TestDrainDirtyReturnsAttachmentDiff(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)

	svc.RecordAttachmentAdded(c.ID, "spec.pdf")
	svc.RecordAttachmentAdded(c.ID, "wireframe.svg")
	svc.RecordAttachmentRemoved(c.ID, "old.txt")

	flags, diff := svc.DrainDirty(c.ID)
	if len(flags) != 1 || flags[0] != "attachments" {
		t.Fatalf("flags = %+v", flags)
	}
	if diff == nil {
		t.Fatalf("expected diff, got nil")
	}
	d := diff.(AttachmentDiff)
	if len(d.Added) != 2 || len(d.Removed) != 1 {
		t.Fatalf("diff = %+v", d)
	}
	if d.Removed[0] != "old.txt" {
		t.Fatalf("unexpected removed: %v", d.Removed)
	}
}

func TestDrainClearsAttachmentDiff(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	svc.RecordAttachmentAdded(c.ID, "x.txt")
	svc.DrainDirty(c.ID)
	flags, diff := svc.DrainDirty(c.ID)
	if len(flags) != 0 || diff != nil {
		t.Fatalf("expected cleared, got %+v %+v", flags, diff)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/card/...`
Expected: FAIL — `RecordAttachmentAdded`, `RecordAttachmentRemoved`, `AttachmentDiff` undefined.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/internal/card/service.go`. Add:

```go
// AttachmentDiff captures what changed on the card's attachment list
// since the last DrainDirty call. Lives in the card package to avoid
// an import cycle with internal/attachment.
type AttachmentDiff struct {
	Added   []string
	Removed []string
}

type dirtyEntry struct {
	flags          map[string]struct{}
	addedFiles     []string
	removedFiles   []string
}
```

Replace the `dirty` field type:

```go
type Service struct {
	store *Store

	dirtyMu sync.Mutex
	dirty   map[string]*dirtyEntry
}
```

Replace `MarkDirty`:

```go
func (s *Service) MarkDirty(id, flag string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	e := s.ensureEntry(id)
	e.flags[flag] = struct{}{}
}

func (s *Service) ensureEntry(id string) *dirtyEntry {
	e, ok := s.dirty[id]
	if !ok {
		e = &dirtyEntry{flags: make(map[string]struct{})}
		s.dirty[id] = e
	}
	return e
}

func (s *Service) RecordAttachmentAdded(id, name string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	e := s.ensureEntry(id)
	e.flags["attachments"] = struct{}{}
	e.addedFiles = append(e.addedFiles, name)
}

func (s *Service) RecordAttachmentRemoved(id, name string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	e := s.ensureEntry(id)
	e.flags["attachments"] = struct{}{}
	e.removedFiles = append(e.removedFiles, name)
}
```

Replace `DrainDirty`:

```go
func (s *Service) DrainDirty(id string) ([]string, any) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	e := s.dirty[id]
	if e == nil || len(e.flags) == 0 {
		return nil, nil
	}
	flags := make([]string, 0, len(e.flags))
	for f := range e.flags {
		flags = append(flags, f)
	}
	var diff any
	if len(e.addedFiles) > 0 || len(e.removedFiles) > 0 {
		diff = AttachmentDiff{
			Added:   append([]string(nil), e.addedFiles...),
			Removed: append([]string(nil), e.removedFiles...),
		}
	}
	delete(s.dirty, id)
	return flags, diff
}
```

Update `NewService`:

```go
func NewService(store *Store) *Service {
	return &Service{
		store: store,
		dirty: make(map[string]*dirtyEntry),
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/card/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/service.go backend/internal/card/dirty_test.go
git commit -m "feat(card): attachment diff in dirty drain"
```

---

## Task Group D — Agent message wrapper + WS wiring (depends on B, C)

### Task D1: Pure `WrapUserMessage` helper

**Files:**
- Create: `backend/internal/agent/wrap.go`
- Create: `backend/internal/agent/wrap_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/agent/wrap_test.go`:

```go
package agent

import (
	"strings"
	"testing"
)

func TestWrapPassthroughWhenClean(t *testing.T) {
	got := WrapUserMessage("hello", nil, nil, nil)
	if got != "hello" {
		t.Fatalf("want unchanged, got %q", got)
	}
}

func TestWrapTitleFlag(t *testing.T) {
	got := WrapUserMessage("hi", []string{"title"}, nil, nil)
	if !strings.Contains(got, "<card-edits-since-last-turn>") {
		t.Fatalf("missing tag: %q", got)
	}
	if !strings.Contains(got, "- Title changed") {
		t.Fatalf("missing title line: %q", got)
	}
	if !strings.Contains(got, "<user-message>\nhi\n</user-message>") {
		t.Fatalf("missing user-message wrapper: %q", got)
	}
}

func TestWrapDescriptionFlag(t *testing.T) {
	got := WrapUserMessage("hi", []string{"description"}, nil, nil)
	if !strings.Contains(got, "- Description changed") {
		t.Fatalf("missing description line: %q", got)
	}
}

func TestWrapAttachmentDiff(t *testing.T) {
	added := []AttachmentInfo{
		{Name: "spec.pdf", Size: 21000, MIMEType: "application/pdf"},
	}
	removed := []string{"old.txt"}
	got := WrapUserMessage("msg", []string{"attachments"}, added, removed)
	if !strings.Contains(got, "- Attached: spec.pdf (21 KB, application/pdf)") {
		t.Fatalf("missing attached line: %q", got)
	}
	if !strings.Contains(got, "- Removed: old.txt") {
		t.Fatalf("missing removed line: %q", got)
	}
}

func TestWrapStableFlagOrder(t *testing.T) {
	got := WrapUserMessage("m", []string{"attachments", "description", "title"}, nil, nil)
	idxTitle := strings.Index(got, "Title changed")
	idxDesc := strings.Index(got, "Description changed")
	idxAtt := strings.Index(got, "Attachments changed")
	if idxTitle == -1 || idxDesc == -1 || idxAtt == -1 {
		t.Fatalf("all three lines must appear: %q", got)
	}
	if !(idxTitle < idxDesc && idxDesc < idxAtt) {
		t.Fatalf("order wrong, want title < description < attachments. got %q", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/agent/...`
Expected: FAIL — `WrapUserMessage`, `AttachmentInfo` undefined.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/agent/wrap.go`:

```go
package agent

import (
	"fmt"
	"sort"
	"strings"
)

// AttachmentInfo is the minimal set of attachment fields the wrapper needs.
// Declared here so internal/agent doesn't import internal/attachment.
type AttachmentInfo struct {
	Name     string
	Size     int64
	MIMEType string
}

// WrapUserMessage decorates a raw user chat message with a block describing
// what the user changed on the card since the last agent turn. It returns
// the original message unchanged when there is nothing to announce.
func WrapUserMessage(msg string, flags []string, added []AttachmentInfo, removed []string) string {
	if len(flags) == 0 && len(added) == 0 && len(removed) == 0 {
		return msg
	}

	lines := make([]string, 0, len(flags)+len(added)+len(removed))
	set := make(map[string]bool, len(flags))
	for _, f := range flags {
		set[f] = true
	}

	// Stable, human-friendly order.
	if set["title"] {
		lines = append(lines, "- Title changed")
	}
	if set["description"] {
		lines = append(lines, "- Description changed")
	}
	if set["attachments"] || len(added) > 0 || len(removed) > 0 {
		lines = append(lines, "- Attachments changed")
	}

	// Sort added deterministically.
	sort.Slice(added, func(i, j int) bool { return added[i].Name < added[j].Name })
	for _, a := range added {
		lines = append(lines, fmt.Sprintf("- Attached: %s (%s, %s)", a.Name, humanSize(a.Size), a.MIMEType))
	}
	removedCopy := append([]string(nil), removed...)
	sort.Strings(removedCopy)
	for _, r := range removedCopy {
		lines = append(lines, "- Removed: "+r)
	}

	var b strings.Builder
	b.WriteString("<card-edits-since-last-turn>\n")
	b.WriteString(strings.Join(lines, "\n"))
	b.WriteString("\n</card-edits-since-last-turn>\n\n")
	b.WriteString("<user-message>\n")
	b.WriteString(msg)
	b.WriteString("\n</user-message>")
	return b.String()
}

func humanSize(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%d KB", n/1024)
	default:
		return fmt.Sprintf("%d MB", n/(1024*1024))
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/agent/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/agent/wrap.go backend/internal/agent/wrap_test.go
git commit -m "feat(agent): WrapUserMessage builds card-edits-since-last-turn block"
```

---

### Task D2: Drain + wrap in the WebSocket send pipeline

**Files:**
- Modify: `backend/internal/websocket/handler.go`
- Create: `backend/internal/websocket/dirty_drain_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/internal/websocket/dirty_drain_test.go`:

```go
package websocket

import (
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
)

// TestBuildAgentMessageWrapsDirty exercises the pure helper that the handler
// will delegate to; the helper is added in Step 3 below.
func TestBuildAgentMessageWrapsDirty(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")
	_, _ = svc.UpdateFields(c.ID, map[string]any{"title": "new"})

	wrapped := buildAgentMessage(svc, c.ID, "do the thing", nil)
	if !strings.Contains(wrapped, "Title changed") {
		t.Fatalf("expected dirty block, got %q", wrapped)
	}
	if !strings.Contains(wrapped, "<user-message>\ndo the thing\n</user-message>") {
		t.Fatalf("expected user-message wrap, got %q", wrapped)
	}
}

func TestBuildAgentMessagePassthroughWhenClean(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")

	msg := buildAgentMessage(svc, c.ID, "hello", nil)
	if msg != "hello" {
		t.Fatalf("expected passthrough, got %q", msg)
	}
	_ = agent.AttachmentInfo{}
}

func TestBuildAgentMessageIncludesAttachmentDetails(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")
	svc.RecordAttachmentAdded(c.ID, "spec.pdf")

	lookup := func(cardID, name string) (agent.AttachmentInfo, bool) {
		return agent.AttachmentInfo{Name: name, Size: 2048, MIMEType: "application/pdf"}, true
	}
	msg := buildAgentMessage(svc, c.ID, "hi", lookup)
	if !strings.Contains(msg, "Attached: spec.pdf (2 KB, application/pdf)") {
		t.Fatalf("missing attached detail: %q", msg)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/websocket/...`
Expected: FAIL — `buildAgentMessage` not defined.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/internal/websocket/handler.go`. Add near the top (after imports):

```go
type attachmentLookup func(cardID, name string) (agent.AttachmentInfo, bool)

// buildAgentMessage drains any pending user edits for cardID and, if there
// are any, wraps message in the card-edits-since-last-turn block.
// lookup resolves added filenames to size + mime for the wrapper; pass nil
// to emit a flag-only note.
func buildAgentMessage(svc *card.Service, cardID, message string, lookup attachmentLookup) string {
	flags, diffAny := svc.DrainDirty(cardID)
	if len(flags) == 0 {
		return message
	}
	var added []agent.AttachmentInfo
	var removed []string
	if d, ok := diffAny.(card.AttachmentDiff); ok {
		removed = d.Removed
		for _, name := range d.Added {
			if lookup != nil {
				if info, found := lookup(cardID, name); found {
					added = append(added, info)
					continue
				}
			}
			added = append(added, agent.AttachmentInfo{Name: name})
		}
	}
	return agent.WrapUserMessage(message, flags, added, removed)
}
```

Then modify the `sendToAgent` closure inside `HandleWebSocket` (around line 94) to use it. Find:

```go
sendToAgent := func(message string) {
```

Add inside, before constructing the `SendRequest`:

```go
wrappedMessage := buildAgentMessage(h.cardSvc, cardID, message, h.attachmentLookup)
```

And replace `Message: message,` with `Message: wrappedMessage,`.

Add a nil-safe method on `*Handler`:

```go
func (h *Handler) attachmentLookup(cardID, name string) (agent.AttachmentInfo, bool) {
	if h.attachments == nil {
		return agent.AttachmentInfo{Name: name}, true
	}
	list, err := h.attachments.List(cardID)
	if err != nil {
		return agent.AttachmentInfo{Name: name}, false
	}
	for _, a := range list {
		if a.Name == name {
			return agent.AttachmentInfo{Name: a.Name, Size: a.Size, MIMEType: a.MIMEType}, true
		}
	}
	return agent.AttachmentInfo{Name: name}, false
}
```

Extend `Handler` struct to carry an `attachments *attachment.Service` (optional). Import `attachment` and wire a constructor parameter in `NewHandler` — default to `nil` for backwards compatibility in tests that don't need it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/websocket/... ./internal/card/... ./internal/agent/...`
Expected: PASS. (Existing WS tests may need `NewHandler` call-site updates to pass `nil` for the new attachment param — fix in place.)

- [ ] **Step 5: Commit**

```bash
git add backend/internal/websocket/handler.go backend/internal/websocket/dirty_drain_test.go
git commit -m "feat(ws): drain dirty flags and wrap user message before Send"
```

---

## Task Group E — MCP attachment tools (depends on A; independent of B/C/D)

### Task E1: `list_attachments` tool

**Files:**
- Modify: `backend/internal/mcp/handlers.go`
- Modify: `backend/internal/mcp/handlers_test.go`
- Modify: `backend/internal/mcp/server.go`

- [ ] **Step 1: Write the failing test**

Add to `backend/internal/mcp/handlers_test.go`:

```go
func TestListAttachmentsReturnsManifestJSON(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")

	attRoot := t.TempDir()
	attSvc := attachment.NewService(attachment.NewStore(attRoot), func() int64 { return 123 })
	_, err := attSvc.Upload(c.ID, "readme.txt", bytes.NewReader([]byte("hello")))
	if err != nil {
		t.Fatalf("Upload: %v", err)
	}

	h := NewHandlersWithAttachments(svc, attSvc)
	res, err := h.ListAttachments(context.Background(), c.ID, nil)
	if err != nil || res.IsError {
		t.Fatalf("ListAttachments: %+v err=%v", res, err)
	}
	if !strings.Contains(res.Message, "readme.txt") {
		t.Fatalf("unexpected message: %q", res.Message)
	}
	var parsed []attachment.Attachment
	if jsonErr := json.Unmarshal([]byte(res.Message), &parsed); jsonErr != nil {
		t.Fatalf("message not JSON: %v", jsonErr)
	}
	if len(parsed) != 1 || parsed[0].Name != "readme.txt" {
		t.Fatalf("unexpected manifest: %+v", parsed)
	}
}
```

Add `"bytes"`, `"encoding/json"`, `"strings"`, `"github.com/jackuait/agent-desk/backend/internal/attachment"` imports as needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/mcp/...`
Expected: FAIL — `NewHandlersWithAttachments` and `ListAttachments` don't exist.

- [ ] **Step 3: Write minimal implementation**

In `backend/internal/mcp/handlers.go`:

```go
// Handlers already holds mutator; add the attachment service.
type Handlers struct {
	mutator     CardMutator
	attachments AttachmentReader
}

// AttachmentReader is the subset of attachment.Service needed here.
type AttachmentReader interface {
	List(cardID string) ([]attachment.Attachment, error)
	Read(cardID, name string) ([]byte, string, error)
}

func NewHandlers(mutator CardMutator) *Handlers {
	return &Handlers{mutator: mutator}
}

func NewHandlersWithAttachments(mutator CardMutator, att AttachmentReader) *Handlers {
	return &Handlers{mutator: mutator, attachments: att}
}

func (h *Handlers) ListAttachments(ctx context.Context, cardID string, _ map[string]any) (ToolResult, error) {
	if h.attachments == nil {
		return ToolResult{Message: "[]"}, nil
	}
	entries, err := h.attachments.List(cardID)
	if err != nil {
		return ToolResult{IsError: true, Message: err.Error()}, nil
	}
	if entries == nil {
		entries = []attachment.Attachment{}
	}
	b, err := json.Marshal(entries)
	if err != nil {
		return ToolResult{IsError: true, Message: err.Error()}, nil
	}
	return ToolResult{Message: string(b)}, nil
}
```

Add `"encoding/json"` and `"github.com/jackuait/agent-desk/backend/internal/attachment"` imports.

In `backend/internal/mcp/server.go`, register the new tool inside `registerTools`:

```go
s.AddTool(
	mcp.NewTool("mcp__agent_desk__list_attachments",
		mcp.WithDescription("List all files attached to the scoped card."),
	),
	toolFunc(h.ListAttachments),
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/mcp/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/handlers.go backend/internal/mcp/handlers_test.go backend/internal/mcp/server.go
git commit -m "feat(mcp): list_attachments tool"
```

---

### Task E2: `read_attachment` tool (text + base64 binary)

**Files:**
- Modify: `backend/internal/mcp/handlers.go`
- Modify: `backend/internal/mcp/handlers_test.go`
- Modify: `backend/internal/mcp/server.go`

- [ ] **Step 1: Write the failing test**

Append to `backend/internal/mcp/handlers_test.go`:

```go
func TestReadAttachmentText(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")

	attSvc := attachment.NewService(attachment.NewStore(t.TempDir()), func() int64 { return 1 })
	if _, err := attSvc.Upload(c.ID, "notes.txt", bytes.NewReader([]byte("plain"))); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	h := NewHandlersWithAttachments(svc, attSvc)

	res, err := h.ReadAttachment(context.Background(), c.ID, map[string]any{"filename": "notes.txt"})
	if err != nil || res.IsError {
		t.Fatalf("ReadAttachment: %+v err=%v", res, err)
	}
	if res.Message != "plain" {
		t.Fatalf("expected plain text, got %q", res.Message)
	}
}

func TestReadAttachmentBinaryIsBase64(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")

	attSvc := attachment.NewService(attachment.NewStore(t.TempDir()), func() int64 { return 1 })
	// PNG magic bytes trigger image/png detection
	pngHeader := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
	if _, err := attSvc.Upload(c.ID, "tiny.png", bytes.NewReader(pngHeader)); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	h := NewHandlersWithAttachments(svc, attSvc)

	res, err := h.ReadAttachment(context.Background(), c.ID, map[string]any{"filename": "tiny.png"})
	if err != nil || res.IsError {
		t.Fatalf("ReadAttachment: %+v err=%v", res, err)
	}
	var parsed struct {
		Encoding string `json:"encoding"`
		Data     string `json:"data"`
	}
	if jsonErr := json.Unmarshal([]byte(res.Message), &parsed); jsonErr != nil {
		t.Fatalf("not JSON: %v", jsonErr)
	}
	if parsed.Encoding != "base64" || parsed.Data == "" {
		t.Fatalf("unexpected: %+v", parsed)
	}
}

func TestReadAttachmentMissing(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := svc.CreateCard("p", "t")
	attSvc := attachment.NewService(attachment.NewStore(t.TempDir()), func() int64 { return 1 })
	h := NewHandlersWithAttachments(svc, attSvc)

	res, _ := h.ReadAttachment(context.Background(), c.ID, map[string]any{"filename": "nope.txt"})
	if !res.IsError {
		t.Fatalf("expected IsError for missing attachment")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/mcp/...`
Expected: FAIL — `ReadAttachment` undefined.

- [ ] **Step 3: Write minimal implementation**

In `backend/internal/mcp/handlers.go` add:

```go
func (h *Handlers) ReadAttachment(ctx context.Context, cardID string, args map[string]any) (ToolResult, error) {
	if h.attachments == nil {
		return ToolResult{IsError: true, Message: "attachments unavailable"}, nil
	}
	name, _ := args["filename"].(string)
	data, mime, err := h.attachments.Read(cardID, name)
	if err != nil {
		return ToolResult{IsError: true, Message: err.Error()}, nil
	}
	if isTextMIME(mime) {
		return ToolResult{Message: string(data)}, nil
	}
	payload := map[string]string{
		"encoding": "base64",
		"data":     base64.StdEncoding.EncodeToString(data),
		"mimeType": mime,
	}
	b, _ := json.Marshal(payload)
	return ToolResult{Message: string(b)}, nil
}

func isTextMIME(mime string) bool {
	switch {
	case strings.HasPrefix(mime, "text/"):
		return true
	case mime == "application/json":
		return true
	case mime == "application/x-yaml", mime == "application/yaml":
		return true
	default:
		return false
	}
}
```

Add `"encoding/base64"` and `"strings"` imports.

In `backend/internal/mcp/server.go`, register:

```go
s.AddTool(
	mcp.NewTool("mcp__agent_desk__read_attachment",
		mcp.WithDescription("Read an attachment's bytes; text types return as string, binaries as base64 JSON."),
		mcp.WithString("filename",
			mcp.Required(),
			mcp.MaxLength(255),
		),
	),
	toolFunc(h.ReadAttachment),
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/mcp/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/handlers.go backend/internal/mcp/handlers_test.go backend/internal/mcp/server.go
git commit -m "feat(mcp): read_attachment tool (text + base64 binary)"
```

---

## Task Group F — Wire everything together in main.go + dirty handoff from attachment handler

### Task F1: Attachment handler records dirty flags + broadcasts card_update

**Files:**
- Modify: `backend/internal/attachment/handler.go`
- Modify: `backend/internal/attachment/handler_test.go`

- [ ] **Step 1: Write the failing test**

Append to `backend/internal/attachment/handler_test.go`:

```go
type fakeDirtyRecorder struct {
	addedCalls   []string
	removedCalls []string
}

func (f *fakeDirtyRecorder) RecordAttachmentAdded(cardID, name string) {
	f.addedCalls = append(f.addedCalls, cardID+":"+name)
}
func (f *fakeDirtyRecorder) RecordAttachmentRemoved(cardID, name string) {
	f.removedCalls = append(f.removedCalls, cardID+":"+name)
}

func TestHandlerRecordsDirtyOnUpload(t *testing.T) {
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	rec := &fakeDirtyRecorder{}
	h := NewHandlerWithRecorder(svc, rec)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "a.txt", "x")
	req := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	req.Header.Set("Content-Type", ct)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload status %d", rr.Code)
	}
	if len(rec.addedCalls) != 1 || rec.addedCalls[0] != "c1:a.txt" {
		t.Fatalf("unexpected calls %+v", rec.addedCalls)
	}
}

func TestHandlerRecordsDirtyOnDelete(t *testing.T) {
	svc := NewService(NewStore(t.TempDir()), func() int64 { return 1 })
	rec := &fakeDirtyRecorder{}
	h := NewHandlerWithRecorder(svc, rec)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	body, ct := multipartUpload(t, "a.txt", "x")
	up := httptest.NewRequest("POST", "/api/cards/c1/attachments", body)
	up.Header.Set("Content-Type", ct)
	mux.ServeHTTP(httptest.NewRecorder(), up)

	del := httptest.NewRequest("DELETE", "/api/cards/c1/attachments/a.txt", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, del)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete status %d", rr.Code)
	}
	if len(rec.removedCalls) != 1 || rec.removedCalls[0] != "c1:a.txt" {
		t.Fatalf("unexpected calls %+v", rec.removedCalls)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/attachment/...`
Expected: FAIL — `NewHandlerWithRecorder` undefined.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/internal/attachment/handler.go`:

```go
type DirtyRecorder interface {
	RecordAttachmentAdded(cardID, name string)
	RecordAttachmentRemoved(cardID, name string)
}

type Handler struct {
	svc      *Service
	recorder DirtyRecorder
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func NewHandlerWithRecorder(svc *Service, rec DirtyRecorder) *Handler {
	return &Handler{svc: svc, recorder: rec}
}
```

In `upload`, after successful `Upload`:

```go
if h.recorder != nil {
	h.recorder.RecordAttachmentAdded(cardID, a.Name)
}
```

In `remove`, after successful `Delete`:

```go
if h.recorder != nil {
	h.recorder.RecordAttachmentRemoved(cardID, name)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/attachment/...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/attachment/handler.go backend/internal/attachment/handler_test.go
git commit -m "feat(attachment): handler reports uploads/deletes to dirty recorder"
```

---

### Task F2: `main.go` wires the attachment service into `card` + `mcp` + `ws`

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Check current wiring**

Run: `grep -n "NewHandler\|attachment" backend/cmd/server/main.go`

- [ ] **Step 2: Write the failing test**

Create `backend/cmd/server/main_test.go` (or append to existing) with a smoke test that spins up the server mux via an internal constructor. If `main.go` doesn't expose one, skip the explicit test for Task F2 and rely on end-to-end test in Task F3 instead.

- [ ] **Step 3: Write minimal implementation**

In `backend/cmd/server/main.go`:

1. Build an attachment store rooted at `filepath.Join(os.Getenv("HOME"), ".agent-desk/cards")` (or env-overridable).
2. `attStore := attachment.NewStore(root); attSvc := attachment.NewService(attStore, time.Now().Unix)`.
3. `attHandler := attachment.NewHandlerWithRecorder(attSvc, cardSvc)` — requires `*card.Service` to satisfy `attachment.DirtyRecorder`. It already has `RecordAttachmentAdded` and `RecordAttachmentRemoved` from Task C1. Confirm method signatures match.
4. `attHandler.RegisterRoutes(mux)`.
5. `mcpHandlers := mcp.NewHandlersWithAttachments(cardSvc, attSvc)` (replace `NewHandlers` call).
6. Pass `attSvc` into `websocket.NewHandler(...)` so it can look up attachments for the wrapper.
7. Update `websocket.NewHandler` signature to accept an `*attachment.Service` (or any type implementing a minimal `List` interface).

- [ ] **Step 4: Run build + existing tests**

Run: `cd backend && go build ./... && go test ./...`
Expected: clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/server/main.go backend/internal/websocket/handler.go
git commit -m "feat(server): wire attachment service into card/mcp/ws"
```

---

## Task Group G — Frontend types + API client (depends on A/F)

### Task G1: Add `Attachment` type to frontend domain

**Files:**
- Modify: `frontend/src/shared/types/domain.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/shared/api/client.test.ts`:

```ts
it("has Attachment type exported via domain", async () => {
  const domain = await import("../types/domain");
  const sample: import("../types/domain").Attachment = {
    name: "x.txt",
    size: 1,
    mimeType: "text/plain",
    uploadedAt: 0,
  };
  expect(sample.name).toBe("x.txt");
  expect(domain).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/shared/api/client.test.ts --run`
Expected: TypeScript error "Cannot find name 'Attachment'".

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/shared/types/domain.ts`. Add:

```ts
export interface Attachment {
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: number;
}
```

Extend `Card`:

```ts
export interface Card {
  // ...existing fields...
  attachments: Attachment[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/shared/api/client.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/types/domain.ts frontend/src/shared/api/client.test.ts
git commit -m "feat(frontend): Attachment type in card domain"
```

---

### Task G2: `api.updateCard`, `uploadAttachment`, `deleteAttachment`, `attachmentUrl`

**Files:**
- Modify: `frontend/src/shared/api/client.ts`
- Modify: `frontend/src/shared/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/shared/api/client.test.ts`:

```ts
describe("updateCard", () => {
  it("PATCHes /api/cards/:id with fields", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "c1", title: "new" }), { status: 200 }),
    );
    await api.updateCard("c1", { title: "new" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/cards/c1",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "new" }),
      }),
    );
  });
});

describe("uploadAttachment", () => {
  it("POSTs multipart to attachments endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ name: "x.txt", size: 1, mimeType: "text/plain", uploadedAt: 1 }),
        { status: 201 },
      ),
    );
    const file = new File(["x"], "x.txt", { type: "text/plain" });
    const result = await api.uploadAttachment("c1", file);
    expect(result.name).toBe("x.txt");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/cards/c1/attachments");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });
});

describe("deleteAttachment", () => {
  it("DELETEs attachment by name", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await api.deleteAttachment("c1", "a.txt");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/cards/c1/attachments/a.txt",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("attachmentUrl", () => {
  it("returns the GET URL for an attachment", () => {
    expect(api.attachmentUrl("c1", "a.txt")).toBe("/api/cards/c1/attachments/a.txt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/shared/api/client.test.ts --run`
Expected: FAIL — `api.updateCard`, `uploadAttachment`, `deleteAttachment`, `attachmentUrl` missing.

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/shared/api/client.ts`. Add inside the `api` object:

```ts
updateCard(id: string, fields: Partial<Card>): Promise<Card> {
  return request<Card>(`/cards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
},
uploadAttachment(id: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  return request<Attachment>(`/cards/${id}/attachments`, {
    method: "POST",
    body: form,
  });
},
deleteAttachment(id: string, name: string): Promise<void> {
  return request<void>(
    `/cards/${id}/attachments/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
},
attachmentUrl(id: string, name: string): string {
  return `/api/cards/${id}/attachments/${encodeURIComponent(name)}`;
},
```

Add `Attachment` to the top-of-file imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/shared/api/client.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/api/client.ts frontend/src/shared/api/client.test.ts
git commit -m "feat(frontend): api.updateCard + attachment CRUD"
```

---

## Task Group H — Editable title + description (depends on G)

### Task H1: `EditableTitle` with debounced auto-save

**Files:**
- Create: `frontend/src/features/card/EditableTitle.tsx`
- Create: `frontend/src/features/card/EditableTitle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/card/EditableTitle.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditableTitle } from "./EditableTitle";

describe("EditableTitle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders value as an editable field", () => {
    render(<EditableTitle value="hello" onChange={() => {}} />);
    const input = screen.getByDisplayValue("hello");
    expect(input).toBeInTheDocument();
  });

  it("auto-saves 500 ms after the last keystroke", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EditableTitle value="x" onChange={onChange} />);
    const input = screen.getByDisplayValue("x");
    await user.clear(input);
    await user.type(input, "new title");
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledWith("new title");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately on blur", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EditableTitle value="x" onChange={onChange} />);
    const input = screen.getByDisplayValue("x");
    await user.clear(input);
    await user.type(input, "b");
    input.blur();
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("does not fire onChange when value matches prop", () => {
    const onChange = vi.fn();
    render(<EditableTitle value="x" onChange={onChange} />);
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/features/card/EditableTitle.test.tsx --run`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/card/EditableTitle.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

interface EditableTitleProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 500;

export function EditableTitle({ value, onChange, placeholder }: EditableTitleProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);

  useEffect(() => {
    setLocal(value);
    committed.current = value;
  }, [value]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (local !== committed.current) {
      committed.current = local;
      onChange(local);
    }
  };

  return (
    <input
      type="text"
      className="w-full bg-transparent text-xl font-semibold text-text-primary outline-none border-b border-transparent focus:border-border-input"
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (next !== committed.current) {
            committed.current = next;
            onChange(next);
          }
        }, DEBOUNCE_MS);
      }}
      onBlur={flush}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/features/card/EditableTitle.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/EditableTitle.tsx frontend/src/features/card/EditableTitle.test.tsx
git commit -m "feat(card): EditableTitle with 500ms debounce"
```

---

### Task H2: `EditableDescription`

**Files:**
- Create: `frontend/src/features/card/EditableDescription.tsx`
- Create: `frontend/src/features/card/EditableDescription.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/card/EditableDescription.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditableDescription } from "./EditableDescription";

describe("EditableDescription", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows rendered markdown when unfocused", () => {
    render(
      <EditableDescription value="# hi" onChange={() => {}} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "hi" })).toBeInTheDocument();
  });

  it("switches to textarea on click and returns rendered markdown on blur", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EditableDescription value="hello" onChange={onChange} />);

    await user.click(screen.getByText("hello"));
    const area = screen.getByRole("textbox");
    await user.clear(area);
    await user.type(area, "updated");
    area.blur();
    expect(onChange).toHaveBeenCalledWith("updated");
  });

  it("debounces 500ms during typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EditableDescription value="a" onChange={onChange} />);
    await user.click(screen.getByText("a"));
    const area = screen.getByRole("textbox");
    await user.clear(area);
    await user.type(area, "b");
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/features/card/EditableDescription.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/card/EditableDescription.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Markdown } from "../../shared/ui/Markdown";

interface EditableDescriptionProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 500;

export function EditableDescription({ value, onChange, placeholder }: EditableDescriptionProps) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);

  useEffect(() => {
    setLocal(value);
    committed.current = value;
  }, [value]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (local !== committed.current) {
      committed.current = local;
      onChange(local);
    }
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="text-sm leading-relaxed text-text-secondary cursor-text min-h-[48px] rounded p-2 -mx-2 hover:bg-bg-hover"
      >
        {value ? <Markdown>{value}</Markdown> : <span className="text-text-muted">{placeholder ?? "Add a description…"}</span>}
      </div>
    );
  }

  return (
    <textarea
      autoFocus
      className="w-full min-h-[120px] bg-transparent text-sm leading-relaxed text-text-primary outline-none border border-border-input rounded p-2"
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (next !== committed.current) {
            committed.current = next;
            onChange(next);
          }
        }, DEBOUNCE_MS);
      }}
      onBlur={() => {
        flush();
        setEditing(false);
      }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/features/card/EditableDescription.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/EditableDescription.tsx frontend/src/features/card/EditableDescription.test.tsx
git commit -m "feat(card): EditableDescription with markdown ↔ textarea toggle"
```

---

## Task Group I — `AttachmentList` component (depends on G)

### Task I1: Render existing attachments with download + delete

**Files:**
- Create: `frontend/src/features/card/AttachmentList.tsx`
- Create: `frontend/src/features/card/AttachmentList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/card/AttachmentList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentList } from "./AttachmentList";
import type { Attachment } from "../../shared/types/domain";

function sample(over: Partial<Attachment> = {}): Attachment {
  return { name: "spec.pdf", size: 2048, mimeType: "application/pdf", uploadedAt: 1, ...over };
}

describe("AttachmentList", () => {
  it("renders each attachment with a download link", () => {
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample(), sample({ name: "wireframe.png", mimeType: "image/png" })]}
        onUpload={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    const link = screen.getByRole("link", { name: /spec.pdf/i });
    expect(link).toHaveAttribute("href", "/files/spec.pdf");
  });

  it("calls onDelete when × clicked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample()]}
        onUpload={() => Promise.resolve()}
        onDelete={onDelete}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove spec.pdf/i }));
    expect(onDelete).toHaveBeenCalledWith("spec.pdf");
  });

  it("uploads file when chosen from file input", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentList
        cardId="c1"
        attachments={[]}
        onUpload={onUpload}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    const input = screen.getByTestId("attachment-file-input") as HTMLInputElement;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/features/card/AttachmentList.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/card/AttachmentList.tsx`:

```tsx
import { useRef, useState } from "react";
import type { Attachment } from "../../shared/types/domain";

interface AttachmentListProps {
  cardId: string;
  attachments: Attachment[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  hrefFor: (cardId: string, name: string) => string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function AttachmentList({ cardId, attachments, onUpload, onDelete, hrefFor }: AttachmentListProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">Attachments</h4>
      <ul className="flex flex-col gap-1 m-0 p-0 list-none">
        {attachments.map((a) => (
          <li key={a.name} className="flex items-center justify-between text-[13px] text-text-secondary font-mono">
            <a
              href={hrefFor(cardId, a.name)}
              download
              className="flex-1 truncate text-accent-blue hover:underline"
            >
              {a.name} <span className="text-text-muted">({formatSize(a.size)}, {a.mimeType})</span>
            </a>
            <button
              type="button"
              aria-label={`remove ${a.name}`}
              onClick={() => onDelete(a.name)}
              className="ml-2 text-text-muted hover:text-accent-red"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div
        className={`border-1.5 border-dashed ${dragOver ? "border-accent-blue bg-bg-hover" : "border-border-input"} rounded-md p-3 text-center text-[11px] text-text-muted cursor-pointer`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        Drop files or click to attach
      </div>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        data-testid="attachment-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (fileInput.current) fileInput.current.value = "";
        }}
      />
      {error && <div role="alert" className="text-[11px] text-accent-red">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/features/card/AttachmentList.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/AttachmentList.tsx frontend/src/features/card/AttachmentList.test.tsx
git commit -m "feat(card): AttachmentList with dropzone + delete"
```

---

## Task Group J — Wire into `CardContent`, `CardModal`, `ProjectsPage` (depends on G, H, I)

### Task J1: `CardContent` consumes new edit/attachment props

**Files:**
- Modify: `frontend/src/features/card/CardContent.tsx`
- Modify: `frontend/src/features/card/CardContent.test.tsx`

- [ ] **Step 1: Write the failing test**

In `CardContent.test.tsx` add:

```tsx
it("calls onUpdate with new title after debounce", async () => {
  const onUpdate = vi.fn();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  vi.useFakeTimers();
  render(
    <CardContent
      card={makeCard()}
      onApprove={() => {}}
      onMerge={() => {}}
      onUpdate={onUpdate}
      onUpload={() => Promise.resolve()}
      onDeleteAttachment={() => Promise.resolve()}
    />,
  );
  const input = screen.getByDisplayValue("Implement auth flow");
  await user.clear(input);
  await user.type(input, "new");
  vi.advanceTimersByTime(500);
  expect(onUpdate).toHaveBeenCalledWith({ title: "new" });
  vi.useRealTimers();
});

it("renders attachment list from card", () => {
  render(
    <CardContent
      card={makeCard({
        attachments: [
          { name: "a.txt", size: 10, mimeType: "text/plain", uploadedAt: 1 },
        ],
      })}
      onApprove={() => {}}
      onMerge={() => {}}
      onUpdate={() => {}}
      onUpload={() => Promise.resolve()}
      onDeleteAttachment={() => Promise.resolve()}
    />,
  );
  expect(screen.getByText(/a\.txt/)).toBeInTheDocument();
});
```

Update `makeCard` helper to default `attachments: []`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/features/card/CardContent.test.tsx --run`
Expected: FAIL — new props unused, heading is static.

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/features/card/CardContent.tsx`:

1. Extend `CardContentProps`:

```ts
interface CardContentProps {
  card: Card;
  projectTitle?: string;
  onApprove: () => void;
  onMerge: () => void;
  onUpdate: (fields: Partial<Card>) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteAttachment: (name: string) => Promise<void>;
}
```

2. Replace the `<h3>` title line with `<EditableTitle value={card.title} onChange={(title) => onUpdate({ title })} />`.
3. Replace the description block with `<EditableDescription value={card.description} onChange={(description) => onUpdate({ description })} />`.
4. Below description (before Acceptance Criteria), render:

```tsx
<AttachmentList
  cardId={card.id}
  attachments={card.attachments ?? []}
  onUpload={onUpload}
  onDelete={onDeleteAttachment}
  hrefFor={api.attachmentUrl}
/>
```

Import `EditableTitle`, `EditableDescription`, `AttachmentList`, and `api`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/features/card/CardContent.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/CardContent.tsx frontend/src/features/card/CardContent.test.tsx
git commit -m "feat(card): CardContent uses editable fields + attachment list"
```

---

### Task J2: `CardModal` + `ProjectsPage` plumbing

**Files:**
- Modify: `frontend/src/features/card/CardModal.tsx`
- Modify: `frontend/src/features/project/ProjectsPage.tsx`
- Modify: `frontend/src/features/project/use-projects.ts`

- [ ] **Step 1: Write the failing test**

Add a test in `frontend/src/features/project/ProjectsPage.test.tsx` (create if missing) that:
1. Mounts ProjectsPage with a seeded card.
2. Opens the card modal.
3. Types a new title.
4. Asserts `api.updateCard` was called with the card's id and `{title}`.

Expected: FAIL (use-projects still mutates local state only).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test src/features/project/ProjectsPage.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/features/project/use-projects.ts`, change `updateCard`:

```ts
const updateCard = useCallback(
  async (card: Card) => {
    setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    await api.updateCard(card.id, {
      title: card.title,
      description: card.description,
    });
  },
  [],
);
```

Add `uploadAttachment` and `deleteAttachment` helpers exposed from the hook that call `api.uploadAttachment` / `api.deleteAttachment` and then refetch or patch local card with the new `attachments` array.

In `frontend/src/features/card/CardModal.tsx`, add new props:

```ts
interface CardModalProps {
  // existing props...
  onUpdate: (fields: Partial<Card>) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteAttachment: (name: string) => Promise<void>;
}
```

Pass them into `CardContent`.

In `frontend/src/features/project/ProjectsPage.tsx`, derive handlers from the active card:

```ts
onUpdate={(fields) => updateCard({ ...activeCard, ...fields })}
onUpload={(file) => uploadAttachment(activeCard.id, file)}
onDeleteAttachment={(name) => deleteAttachment(activeCard.id, name)}
```

Pass them into `CardModal`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && yarn test src/features/project/ProjectsPage.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/CardModal.tsx frontend/src/features/project/ProjectsPage.tsx frontend/src/features/project/use-projects.ts frontend/src/features/project/ProjectsPage.test.tsx
git commit -m "feat(project): wire edit + attachment handlers through card modal"
```

---

## Task Group K — Full-stack verification

### Task K1: Backend build + test sweep

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && go test ./...`
Expected: all pass.

- [ ] **Step 2: Run backend build**

Run: `cd backend && go build ./...`
Expected: clean.

- [ ] **Step 3: Commit if anything was touched**

If nothing changed, skip commit.

### Task K2: Frontend build + lint + test sweep

- [ ] **Step 1: Run frontend tests**

Run: `cd frontend && yarn test --run`
Expected: all pass.

- [ ] **Step 2: Run lint**

Run: `cd frontend && yarn lint`
Expected: clean.

- [ ] **Step 3: Run typecheck/build**

Run: `cd frontend && yarn build`
Expected: clean.

### Task K3: Manual smoke in browser

- [ ] **Step 1: Start dev stack**

Run backend and frontend dev servers per project convention.

- [ ] **Step 2: Exercise the golden path**

1. Create or open a card.
2. Edit the title, wait ~600 ms, reload — title persists.
3. Edit the description, wait ~600 ms, reload — persists.
4. Drop a text file into the attachment zone — appears in the list.
5. Send a chat message — inspect server logs / agent input to confirm the message was wrapped with `<card-edits-since-last-turn>` containing the edit summary.
6. Delete the attachment — list updates, next chat reports it removed.

- [ ] **Step 3: Record anything broken as a follow-up task**

---

## Self-review notes

- Every spec requirement ties to a task: editable title (H1), editable description (H2), attachments (A1–A4, I1, F1, F2), agent dirty notification (B1, C1, D1, D2), MCP attachment tools (E1, E2), source-aware mutations (B2), wiring (G2, J1, J2), verification (K1–K3).
- All code blocks contain concrete implementations — no `// TODO`.
- `CardMutator` swaps `UpdateFields` → `UpdateFieldsFromAgent` in Task B2 to preserve the "agent path never dirties" invariant.
- `DrainDirty` is changed in C1 from a stub to a real diff-returning signature; Task D2 depends on that signature.
- Frontend debounce constant (500 ms) appears in H1 and H2 only — there is no drift.
- Parallelism map: Groups A, B, D1, E1/E2 are independent. C depends on B. D2 depends on B+C+D1. F1 depends on C. F2 depends on A+B+C+D+E+F1. G/H/I are independent of F2 except J uses both. K is the terminal verify.
