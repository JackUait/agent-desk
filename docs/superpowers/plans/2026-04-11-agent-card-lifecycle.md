# Agent Card Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full vertical slice where users create kanban cards, chat with Claude Code agents via WebSocket, agents work in git worktrees, and deliver GitHub PRs for review and merge.

**Architecture:** Go backend spawns one `claude` CLI process per card, pipes chat via WebSocket. Frontend React app shows a kanban board with a split card modal (content left, chat right). Cards progress through Backlog → In Progress → Review → Done with strict state machine transitions.

**Tech Stack:** Go 1.25 + nhooyr.io/websocket, React 19 + TypeScript 6 + Vite, CSS Modules, Claude Code CLI (`claude -p --output-format stream-json`)

---

## File Structure

### Backend — New/Modified Files

```
backend/
├── cmd/server/main.go                     ← MODIFY: new routes, CORS, WebSocket
├── internal/
│   ├── board/
│   │   ├── handler.go                     ← REPLACE: single GET /api/board
│   │   ├── handler_test.go                ← REPLACE: new tests
│   │   ├── board.go                       ← CREATE: Board type with fixed columns
│   │   ├── repository.go                  ← DELETE (types move to board.go)
│   │   └── service.go                     ← DELETE (no service needed)
│   ├── card/
│   │   ├── card.go                        ← CREATE: Card type + Column enum
│   │   ├── store.go                       ← CREATE: in-memory store
│   │   ├── store_test.go                  ← CREATE: store tests
│   │   ├── service.go                     ← CREATE: state machine + lifecycle
│   │   ├── service_test.go                ← CREATE: service tests
│   │   ├── handler.go                     ← CREATE: REST handlers
│   │   └── handler_test.go                ← CREATE: handler tests
│   ├── agent/
│   │   ├── process.go                     ← CREATE: Claude CLI process wrapper
│   │   ├── process_test.go                ← CREATE: process tests
│   │   ├── parser.go                      ← CREATE: stream-json parser
│   │   ├── parser_test.go                 ← CREATE: parser tests
│   │   ├── manager.go                     ← CREATE: process lifecycle manager
│   │   ├── manager_test.go                ← CREATE: manager tests
│   │   ├── provider.go                    ← DELETE (replaced by process.go)
│   │   └── provider_test.go               ← DELETE (replaced)
│   ├── websocket/
│   │   ├── hub.go                         ← CREATE: connection registry per card
│   │   ├── hub_test.go                    ← CREATE: hub tests
│   │   ├── handler.go                     ← CREATE: upgrade + message routing
│   │   └── handler_test.go                ← CREATE: handler tests
│   ├── worktree/
│   │   ├── service.go                     ← CREATE: git worktree lifecycle
│   │   └── service_test.go                ← CREATE: worktree tests
│   ├── conversation/                      ← DELETE entire package
│   └── domain/
│       └── message.go                     ← KEEP as-is
├── pkg/
│   ├── httputil/respond.go                ← KEEP as-is
│   └── middleware/
│       └── cors.go                        ← CREATE: CORS middleware
└── go.mod                                 ← MODIFY: add nhooyr.io/websocket
```

### Frontend — New/Modified Files

```
frontend/src/
├── features/
│   ├── board/
│   │   ├── BoardPage.tsx                  ← MODIFY: add create card, open modal
│   │   ├── BoardPage.test.tsx             ← MODIFY: new tests
│   │   ├── BoardPage.module.css           ← MODIFY: modal overlay
│   │   ├── Column.tsx                     ← MODIFY: click card → open modal
│   │   ├── Column.test.tsx                ← MODIFY: click tests
│   │   ├── KanbanCard.tsx                 ← MODIFY: add onClick
│   │   ├── KanbanCard.test.tsx            ← MODIFY: click tests
│   │   ├── use-board.ts                   ← MODIFY: fetch from API, addCard, updateCard
│   │   └── use-board.test.ts              ← MODIFY: API integration tests
│   ├── card/
│   │   ├── CardModal.tsx                  ← CREATE: split modal layout
│   │   ├── CardModal.module.css           ← CREATE: modal styles
│   │   ├── CardModal.test.tsx             ← CREATE: modal tests
│   │   ├── CardContent.tsx                ← CREATE: left panel (fields + buttons)
│   │   ├── CardContent.module.css         ← CREATE: content styles
│   │   ├── CardContent.test.tsx           ← CREATE: content tests
│   │   ├── index.ts                       ← MODIFY: new exports
│   │   ├── CardDetail.tsx                 ← DELETE (replaced by modal)
│   │   └── CardDetail.test.tsx            ← DELETE (replaced)
│   └── chat/
│       ├── ChatPanel.tsx                  ← REPLACE: WebSocket-powered chat
│       ├── ChatPanel.module.css           ← CREATE: chat styles
│       ├── ChatPanel.test.tsx             ← REPLACE: new tests
│       ├── ChatMessage.tsx                ← CREATE: message bubble component
│       ├── ChatMessage.module.css         ← CREATE: message styles
│       ├── ChatMessage.test.tsx           ← CREATE: message tests
│       └── index.ts                       ← KEEP
├── shared/
│   ├── api/
│   │   ├── client.ts                      ← CREATE: REST HTTP client
│   │   ├── client.test.ts                 ← CREATE: client tests
│   │   ├── useCardSocket.ts               ← CREATE: WebSocket hook
│   │   ├── useCardSocket.test.ts          ← CREATE: hook tests
│   │   └── agent-provider.ts              ← DELETE (replaced by client + socket)
│   └── types/
│       └── domain.ts                      ← MODIFY: extended Card type + WS messages
```

---

## Task 1: Card Domain Type + In-Memory Store

**Files:**
- Create: `backend/internal/card/card.go`
- Create: `backend/internal/card/store.go`
- Create: `backend/internal/card/store_test.go`

- [ ] **Step 1: Write the failing test for card store Create + Get**

```go
// backend/internal/card/store_test.go
package card_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func TestStore_CreateAndGet(t *testing.T) {
	s := card.NewStore()

	c := s.Create("Test card")
	if c.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if c.Title != "Test card" {
		t.Errorf("expected title %q, got %q", "Test card", c.Title)
	}
	if c.Column != card.Backlog {
		t.Errorf("expected column %q, got %q", card.Backlog, c.Column)
	}

	got, ok := s.Get(c.ID)
	if !ok {
		t.Fatal("expected to find card")
	}
	if got.ID != c.ID {
		t.Errorf("expected ID %q, got %q", c.ID, got.ID)
	}
}

func TestStore_GetNotFound(t *testing.T) {
	s := card.NewStore()
	_, ok := s.Get("nonexistent")
	if ok {
		t.Error("expected not found")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/card/ -v`
Expected: FAIL — package doesn't exist yet.

- [ ] **Step 3: Write Card type and Store implementation**

```go
// backend/internal/card/card.go
package card

import "time"

type Column string

const (
	Backlog    Column = "backlog"
	InProgress Column = "in_progress"
	Review     Column = "review"
	Done       Column = "done"
)

type Card struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Column             Column   `json:"column"`
	AcceptanceCriteria []string `json:"acceptanceCriteria"`
	Complexity         string   `json:"complexity"`
	RelevantFiles      []string `json:"relevantFiles"`
	SessionID          string   `json:"sessionId"`
	WorktreePath       string   `json:"worktreePath"`
	BranchName         string   `json:"branchName"`
	PRUrl              string   `json:"prUrl"`
	CreatedAt          int64    `json:"createdAt"`
}

func newCard(title string) Card {
	return Card{
		ID:        generateID(),
		Title:     title,
		Column:    Backlog,
		CreatedAt: time.Now().Unix(),
	}
}
```

```go
// backend/internal/card/store.go
package card

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type Store struct {
	mu    sync.RWMutex
	cards map[string]Card
}

func NewStore() *Store {
	return &Store{cards: make(map[string]Card)}
}

func (s *Store) Create(title string) Card {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := newCard(title)
	s.cards[c.ID] = c
	return c
}

func (s *Store) Get(id string) (Card, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.cards[id]
	return c, ok
}

func (s *Store) List() []Card {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Card, 0, len(s.cards))
	for _, c := range s.cards {
		result = append(result, c)
	}
	return result
}

func (s *Store) Update(c Card) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cards[c.ID]; !ok {
		return false
	}
	s.cards[c.ID] = c
	return true
}

func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cards[id]; !ok {
		return false
	}
	delete(s.cards, id)
	return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/card/ -v`
Expected: PASS

- [ ] **Step 5: Write tests for List, Update, Delete**

```go
// Append to backend/internal/card/store_test.go

func TestStore_List(t *testing.T) {
	s := card.NewStore()
	s.Create("Card A")
	s.Create("Card B")

	list := s.List()
	if len(list) != 2 {
		t.Errorf("expected 2 cards, got %d", len(list))
	}
}

func TestStore_Update(t *testing.T) {
	s := card.NewStore()
	c := s.Create("Original")
	c.Title = "Updated"
	if !s.Update(c) {
		t.Fatal("expected update to succeed")
	}
	got, _ := s.Get(c.ID)
	if got.Title != "Updated" {
		t.Errorf("expected title %q, got %q", "Updated", got.Title)
	}
}

func TestStore_UpdateNotFound(t *testing.T) {
	s := card.NewStore()
	if s.Update(card.Card{ID: "nope"}) {
		t.Error("expected update to fail")
	}
}

func TestStore_Delete(t *testing.T) {
	s := card.NewStore()
	c := s.Create("To delete")
	if !s.Delete(c.ID) {
		t.Fatal("expected delete to succeed")
	}
	_, ok := s.Get(c.ID)
	if ok {
		t.Error("expected card to be deleted")
	}
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && go test ./internal/card/ -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add internal/card/
git commit -m "feat(backend): add card domain type and in-memory store"
```

---

## Task 2: Card Service with State Machine

**Files:**
- Create: `backend/internal/card/service.go`
- Create: `backend/internal/card/service_test.go`

- [ ] **Step 1: Write the failing test for valid state transitions**

```go
// backend/internal/card/service_test.go
package card_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func TestService_StartDevelopment(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)

	c := store.Create("Test")
	got, err := svc.StartDevelopment(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Column != card.InProgress {
		t.Errorf("expected column %q, got %q", card.InProgress, got.Column)
	}
}

func TestService_StartDevelopment_InvalidColumn(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)

	c := store.Create("Test")
	// Move to InProgress first
	svc.StartDevelopment(c.ID)
	// Try to start again — should fail
	_, err := svc.StartDevelopment(c.ID)
	if err == nil {
		t.Fatal("expected error for invalid transition")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/card/ -v -run TestService`
Expected: FAIL — `NewService` not defined.

- [ ] **Step 3: Write Service with state machine**

```go
// backend/internal/card/service.go
package card

import "fmt"

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) CreateCard(title string) Card {
	return s.store.Create(title)
}

func (s *Service) GetCard(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	return c, nil
}

func (s *Service) ListCards() []Card {
	return s.store.List()
}

func (s *Service) UpdateFields(id string, fields map[string]any) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if v, ok := fields["title"].(string); ok {
		c.Title = v
	}
	if v, ok := fields["description"].(string); ok {
		c.Description = v
	}
	if v, ok := fields["complexity"].(string); ok {
		c.Complexity = v
	}
	if v, ok := fields["acceptanceCriteria"].([]string); ok {
		c.AcceptanceCriteria = v
	}
	if v, ok := fields["relevantFiles"].([]string); ok {
		c.RelevantFiles = v
	}
	s.store.Update(c)
	return c, nil
}

func (s *Service) StartDevelopment(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if c.Column != Backlog {
		return Card{}, fmt.Errorf("cannot start development: card is in %q, must be in %q", c.Column, Backlog)
	}
	c.Column = InProgress
	s.store.Update(c)
	return c, nil
}

func (s *Service) MoveToReview(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if c.Column != InProgress {
		return Card{}, fmt.Errorf("cannot move to review: card is in %q, must be in %q", c.Column, InProgress)
	}
	c.Column = Review
	s.store.Update(c)
	return c, nil
}

func (s *Service) RejectToInProgress(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if c.Column != Review {
		return Card{}, fmt.Errorf("cannot reject: card is in %q, must be in %q", c.Column, Review)
	}
	c.Column = InProgress
	s.store.Update(c)
	return c, nil
}

func (s *Service) SetPRUrl(id, prUrl string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if c.Column != Review {
		return Card{}, fmt.Errorf("cannot set PR: card is in %q, must be in %q", c.Column, Review)
	}
	c.PRUrl = prUrl
	s.store.Update(c)
	return c, nil
}

func (s *Service) MoveToDone(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	if c.Column != Review {
		return Card{}, fmt.Errorf("cannot move to done: card is in %q, must be in %q", c.Column, Review)
	}
	if c.PRUrl == "" {
		return Card{}, fmt.Errorf("cannot move to done: no PR URL set")
	}
	c.Column = Done
	s.store.Update(c)
	return c, nil
}

func (s *Service) SetWorktree(id, path, branch string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	c.WorktreePath = path
	c.BranchName = branch
	s.store.Update(c)
	return c, nil
}

func (s *Service) SetSessionID(id, sessionID string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	c.SessionID = sessionID
	s.store.Update(c)
	return c, nil
}

func (s *Service) DeleteCard(id string) error {
	if !s.store.Delete(id) {
		return fmt.Errorf("card %q not found", id)
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./internal/card/ -v -run TestService`
Expected: PASS

- [ ] **Step 5: Write tests for all remaining transitions**

```go
// Append to backend/internal/card/service_test.go

func TestService_MoveToReview(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")
	svc.StartDevelopment(c.ID)

	got, err := svc.MoveToReview(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Column != card.Review {
		t.Errorf("expected %q, got %q", card.Review, got.Column)
	}
}

func TestService_MoveToReview_InvalidColumn(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")

	_, err := svc.MoveToReview(c.ID)
	if err == nil {
		t.Fatal("expected error: card is in backlog")
	}
}

func TestService_RejectToInProgress(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)

	got, err := svc.RejectToInProgress(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Column != card.InProgress {
		t.Errorf("expected %q, got %q", card.InProgress, got.Column)
	}
}

func TestService_MoveToDone_RequiresPR(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)

	_, err := svc.MoveToDone(c.ID)
	if err == nil {
		t.Fatal("expected error: no PR URL")
	}
}

func TestService_MoveToDone_WithPR(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	svc.SetPRUrl(c.ID, "https://github.com/example/pr/1")

	got, err := svc.MoveToDone(c.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Column != card.Done {
		t.Errorf("expected %q, got %q", card.Done, got.Column)
	}
}

func TestService_UpdateFields(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Original")

	got, err := svc.UpdateFields(c.ID, map[string]any{
		"title":       "Updated",
		"description": "New desc",
		"complexity":  "High",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Title != "Updated" {
		t.Errorf("expected title %q, got %q", "Updated", got.Title)
	}
	if got.Description != "New desc" {
		t.Errorf("expected description %q, got %q", "New desc", got.Description)
	}
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && go test ./internal/card/ -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add internal/card/service.go internal/card/service_test.go
git commit -m "feat(backend): add card service with state machine transitions"
```

---

## Task 3: Card HTTP Handlers

**Files:**
- Create: `backend/internal/card/handler.go`
- Create: `backend/internal/card/handler_test.go`

- [ ] **Step 1: Write failing test for CreateCard and ListCards handlers**

```go
// backend/internal/card/handler_test.go
package card_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func setupHandler() *card.Handler {
	store := card.NewStore()
	svc := card.NewService(store)
	return card.NewHandler(svc)
}

func TestHandler_CreateCard(t *testing.T) {
	h := setupHandler()
	body := strings.NewReader(`{"title":"Test card"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.CreateCard(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected %d, got %d", http.StatusCreated, rec.Code)
	}
	var c card.Card
	json.NewDecoder(rec.Body).Decode(&c)
	if c.ID == "" {
		t.Error("expected non-empty ID")
	}
	if c.Title != "Test card" {
		t.Errorf("expected title %q, got %q", "Test card", c.Title)
	}
	if c.Column != card.Backlog {
		t.Errorf("expected column %q, got %q", card.Backlog, c.Column)
	}
}

func TestHandler_ListCards(t *testing.T) {
	h := setupHandler()
	// Create two cards first
	for _, title := range []string{"A", "B"} {
		body := strings.NewReader(`{"title":"` + title + `"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
		req.Header.Set("Content-Type", "application/json")
		h.CreateCard(httptest.NewRecorder(), req)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/cards", nil)
	rec := httptest.NewRecorder()
	h.ListCards(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected %d, got %d", http.StatusOK, rec.Code)
	}
	var cards []card.Card
	json.NewDecoder(rec.Body).Decode(&cards)
	if len(cards) != 2 {
		t.Errorf("expected 2 cards, got %d", len(cards))
	}
}

func TestHandler_GetCard(t *testing.T) {
	h := setupHandler()
	body := strings.NewReader(`{"title":"Find me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)
	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req = httptest.NewRequest(http.MethodGet, "/api/cards/"+created.ID, nil)
	req.SetPathValue("id", created.ID)
	rec = httptest.NewRecorder()
	h.GetCard(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected %d, got %d", http.StatusOK, rec.Code)
	}
	var got card.Card
	json.NewDecoder(rec.Body).Decode(&got)
	if got.ID != created.ID {
		t.Errorf("expected ID %q, got %q", created.ID, got.ID)
	}
}

func TestHandler_GetCard_NotFound(t *testing.T) {
	h := setupHandler()
	req := httptest.NewRequest(http.MethodGet, "/api/cards/nope", nil)
	req.SetPathValue("id", "nope")
	rec := httptest.NewRecorder()
	h.GetCard(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected %d, got %d", http.StatusNotFound, rec.Code)
	}
}

func TestHandler_DeleteCard(t *testing.T) {
	h := setupHandler()
	body := strings.NewReader(`{"title":"Delete me"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/cards", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.CreateCard(rec, req)
	var created card.Card
	json.NewDecoder(rec.Body).Decode(&created)

	req = httptest.NewRequest(http.MethodDelete, "/api/cards/"+created.ID, nil)
	req.SetPathValue("id", created.ID)
	rec = httptest.NewRecorder()
	h.DeleteCard(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected %d, got %d", http.StatusNoContent, rec.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/card/ -v -run TestHandler`
Expected: FAIL — `NewHandler` not defined.

- [ ] **Step 3: Write Handler implementation**

```go
// backend/internal/card/handler.go
package card

import (
	"encoding/json"
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) CreateCard(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		httputil.Error(w, http.StatusBadRequest, "title is required")
		return
	}
	c := h.svc.CreateCard(req.Title)
	httputil.JSON(w, http.StatusCreated, c)
}

func (h *Handler) ListCards(w http.ResponseWriter, r *http.Request) {
	cards := h.svc.ListCards()
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
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MergeCard(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := h.svc.MoveToDone(id)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/cards", h.CreateCard)
	mux.HandleFunc("GET /api/cards", h.ListCards)
	mux.HandleFunc("GET /api/cards/{id}", h.GetCard)
	mux.HandleFunc("PATCH /api/cards/{id}", h.UpdateCard)
	mux.HandleFunc("DELETE /api/cards/{id}", h.DeleteCard)
	mux.HandleFunc("POST /api/cards/{id}/merge", h.MergeCard)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/card/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add internal/card/handler.go internal/card/handler_test.go
git commit -m "feat(backend): add card REST handlers with CRUD + merge"
```

---

## Task 4: Simplified Board Handler

**Files:**
- Create: `backend/internal/board/board.go`
- Modify: `backend/internal/board/handler.go`
- Modify: `backend/internal/board/handler_test.go`
- Delete: `backend/internal/board/repository.go`
- Delete: `backend/internal/board/service.go`

- [ ] **Step 1: Write failing test for new GET /api/board endpoint**

```go
// backend/internal/board/handler_test.go — REPLACE entire file
package board_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/card"
)

func TestGetBoard(t *testing.T) {
	store := card.NewStore()
	store.Create("Card A")

	h := board.NewHandler(store)
	req := httptest.NewRequest(http.MethodGet, "/api/board", nil)
	rec := httptest.NewRecorder()

	h.GetBoard(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected %d, got %d", http.StatusOK, rec.Code)
	}

	var b board.BoardResponse
	if err := json.NewDecoder(rec.Body).Decode(&b); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if len(b.Columns) != 4 {
		t.Errorf("expected 4 columns, got %d", len(b.Columns))
	}
	if b.Columns[0].Title != "Backlog" {
		t.Errorf("expected first column %q, got %q", "Backlog", b.Columns[0].Title)
	}
	// Card A should be in Backlog
	if len(b.Columns[0].CardIDs) != 1 {
		t.Errorf("expected 1 card in Backlog, got %d", len(b.Columns[0].CardIDs))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/board/ -v`
Expected: FAIL — `NewHandler`, `BoardResponse` not defined.

- [ ] **Step 3: Write board.go and new handler**

```go
// backend/internal/board/board.go
package board

type ColumnResponse struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	CardIDs []string `json:"cardIds"`
}

type BoardResponse struct {
	ID      string           `json:"id"`
	Title   string           `json:"title"`
	Columns []ColumnResponse `json:"columns"`
}
```

```go
// backend/internal/board/handler.go — REPLACE entire file
package board

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

var columns = []struct {
	id     string
	title  string
	column card.Column
}{
	{"col-backlog", "Backlog", card.Backlog},
	{"col-progress", "In Progress", card.InProgress},
	{"col-review", "Review", card.Review},
	{"col-done", "Done", card.Done},
}

type Handler struct {
	cardStore *card.Store
}

func NewHandler(cardStore *card.Store) *Handler {
	return &Handler{cardStore: cardStore}
}

func (h *Handler) GetBoard(w http.ResponseWriter, r *http.Request) {
	cards := h.cardStore.List()

	// Group card IDs by column
	columnCards := make(map[card.Column][]string)
	for _, c := range cards {
		columnCards[c.Column] = append(columnCards[c.Column], c.ID)
	}

	resp := BoardResponse{
		ID:    "board-1",
		Title: "Agent Desk",
	}
	for _, col := range columns {
		ids := columnCards[col.column]
		if ids == nil {
			ids = []string{}
		}
		resp.Columns = append(resp.Columns, ColumnResponse{
			ID:      col.id,
			Title:   col.title,
			CardIDs: ids,
		})
	}

	httputil.JSON(w, http.StatusOK, resp)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/board", h.GetBoard)
}
```

- [ ] **Step 4: Delete old files**

```bash
cd backend && rm -f internal/board/repository.go internal/board/service.go
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && go test ./internal/board/ -v`
Expected: PASS

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: All pass. (Old board tests replaced, conversation tests may fail — we'll handle that next.)

- [ ] **Step 7: Delete conversation package**

```bash
cd backend && rm -rf internal/conversation/
```

- [ ] **Step 8: Commit**

```bash
cd backend && git add -A
git commit -m "refactor(backend): simplify board to single endpoint, remove conversation package"
```

---

## Task 5: CORS Middleware + Wiring main.go

**Files:**
- Create: `backend/pkg/middleware/cors.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Write CORS middleware**

```go
// backend/pkg/middleware/cors.go
package middleware

import "net/http"

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 2: Rewire main.go with new routes**

```go
// backend/cmd/server/main.go — REPLACE entire file
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"github.com/jackuait/agent-desk/backend/pkg/middleware"
)

func main() {
	mux := http.NewServeMux()

	cardStore := card.NewStore()
	cardSvc := card.NewService(cardStore)
	cardHandler := card.NewHandler(cardSvc)
	boardHandler := board.NewHandler(cardStore)

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok\n"))
	})

	cardHandler.RegisterRoutes(mux)
	boardHandler.RegisterRoutes(mux)

	server := &http.Server{
		Addr:         ":8080",
		Handler:      middleware.CORS(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server forced to shutdown: %v", err)
		}
	}()

	log.Println("Server starting on :8080")
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
```

- [ ] **Step 3: Verify build and all tests pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
cd backend && git add -A
git commit -m "feat(backend): add CORS middleware and wire card/board routes in main"
```

---

## Task 6: Claude CLI Stream-JSON Parser

**Files:**
- Create: `backend/internal/agent/parser.go`
- Create: `backend/internal/agent/parser_test.go`
- Delete: `backend/internal/agent/provider.go`
- Delete: `backend/internal/agent/provider_test.go`

- [ ] **Step 1: Write failing test for parsing stream events**

```go
// backend/internal/agent/parser_test.go
package agent_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

func TestParseStreamEvent_TextDelta(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.SessionID != "sess-123" {
		t.Errorf("expected session %q, got %q", "sess-123", ev.SessionID)
	}
	if ev.Type != agent.EventTextDelta {
		t.Errorf("expected type %q, got %q", agent.EventTextDelta, ev.Type)
	}
	if ev.Text != "Hello " {
		t.Errorf("expected text %q, got %q", "Hello ", ev.Text)
	}
}

func TestParseStreamEvent_MessageStart(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"message_start","message":{"id":"msg-1","role":"assistant"}}}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStart {
		t.Errorf("expected type %q, got %q", agent.EventMessageStart, ev.Type)
	}
}

func TestParseStreamEvent_MessageStop(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"message_stop"}}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventMessageStop {
		t.Errorf("expected type %q, got %q", agent.EventMessageStop, ev.Type)
	}
}

func TestParseStreamEvent_ToolUse(t *testing.T) {
	line := `{"type":"stream_event","session_id":"sess-123","event":{"type":"content_block_start","content_block":{"type":"tool_use","id":"tool-1","name":"Bash"}}}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventToolUseStart {
		t.Errorf("expected type %q, got %q", agent.EventToolUseStart, ev.Type)
	}
	if ev.ToolName != "Bash" {
		t.Errorf("expected tool %q, got %q", "Bash", ev.ToolName)
	}
}

func TestParseStreamEvent_Result(t *testing.T) {
	line := `{"type":"result","session_id":"sess-123","result":"Task complete"}`

	ev, err := agent.ParseStreamEvent(line)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ev.Type != agent.EventResult {
		t.Errorf("expected type %q, got %q", agent.EventResult, ev.Type)
	}
	if ev.Text != "Task complete" {
		t.Errorf("expected text %q, got %q", "Task complete", ev.Text)
	}
}

func TestParseStreamEvent_InvalidJSON(t *testing.T) {
	_, err := agent.ParseStreamEvent("not json")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/agent/ -v`
Expected: FAIL — `ParseStreamEvent` not defined.

- [ ] **Step 3: Delete old provider files, write parser**

```bash
cd backend && rm -f internal/agent/provider.go internal/agent/provider_test.go
```

```go
// backend/internal/agent/parser.go
package agent

import "encoding/json"

type EventType string

const (
	EventTextDelta    EventType = "text_delta"
	EventMessageStart EventType = "message_start"
	EventMessageStop  EventType = "message_stop"
	EventToolUseStart EventType = "tool_use_start"
	EventToolUseEnd   EventType = "tool_use_end"
	EventResult       EventType = "result"
	EventUnknown      EventType = "unknown"
)

type StreamEvent struct {
	Type      EventType
	SessionID string
	Text      string
	ToolName  string
	ToolID    string
	Raw       json.RawMessage
}

func ParseStreamEvent(line string) (StreamEvent, error) {
	var raw struct {
		Type      string          `json:"type"`
		SessionID string          `json:"session_id"`
		Result    string          `json:"result"`
		Event     json.RawMessage `json:"event"`
	}
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return StreamEvent{}, err
	}

	ev := StreamEvent{
		SessionID: raw.SessionID,
		Raw:       json.RawMessage(line),
	}

	if raw.Type == "result" {
		ev.Type = EventResult
		ev.Text = raw.Result
		return ev, nil
	}

	if raw.Event == nil {
		ev.Type = EventUnknown
		return ev, nil
	}

	var inner struct {
		Type         string `json:"type"`
		ContentBlock struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"content_block"`
		Delta struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"delta"`
	}
	if err := json.Unmarshal(raw.Event, &inner); err != nil {
		ev.Type = EventUnknown
		return ev, nil
	}

	switch inner.Type {
	case "message_start":
		ev.Type = EventMessageStart
	case "message_stop":
		ev.Type = EventMessageStop
	case "content_block_start":
		if inner.ContentBlock.Type == "tool_use" {
			ev.Type = EventToolUseStart
			ev.ToolName = inner.ContentBlock.Name
			ev.ToolID = inner.ContentBlock.ID
		} else {
			ev.Type = EventUnknown
		}
	case "content_block_stop":
		ev.Type = EventToolUseEnd
	case "content_block_delta":
		if inner.Delta.Type == "text_delta" {
			ev.Type = EventTextDelta
			ev.Text = inner.Delta.Text
		} else {
			ev.Type = EventUnknown
		}
	default:
		ev.Type = EventUnknown
	}

	return ev, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/agent/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add -A
git commit -m "feat(backend): add Claude CLI stream-json parser"
```

---

## Task 7: Claude CLI Process Manager

**Files:**
- Create: `backend/internal/agent/manager.go`
- Create: `backend/internal/agent/manager_test.go`

- [ ] **Step 1: Write failing test for process manager Spawn and Send**

```go
// backend/internal/agent/manager_test.go
package agent_test

import (
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

func TestManager_SpawnAndRead(t *testing.T) {
	// Use echo as a fake claude process for testing
	m := agent.NewManager("echo")
	events := make(chan agent.StreamEvent, 10)

	err := m.Spawn("card-1", "", events)
	if err != nil {
		t.Fatalf("failed to spawn: %v", err)
	}
	defer m.Kill("card-1")

	// echo outputs a single line and exits — we should get it
	select {
	case <-events:
		// Got an event (might be parse error from echo, that's fine)
	case <-time.After(2 * time.Second):
		// echo exits quickly, channel may close
	}

	if !m.IsRunning("card-1") && !m.HasExited("card-1") {
		t.Error("expected process to be running or exited")
	}
}

func TestManager_Kill(t *testing.T) {
	// Use "sleep" as a long-running fake process
	m := agent.NewManager("sleep")
	events := make(chan agent.StreamEvent, 10)

	err := m.Spawn("card-2", "", events)
	if err != nil {
		t.Fatalf("failed to spawn: %v", err)
	}

	err = m.Kill("card-2")
	if err != nil {
		t.Fatalf("failed to kill: %v", err)
	}

	time.Sleep(100 * time.Millisecond)
	if m.IsRunning("card-2") {
		t.Error("expected process to be stopped")
	}
}

func TestManager_SpawnDuplicate(t *testing.T) {
	m := agent.NewManager("echo")
	events := make(chan agent.StreamEvent, 10)

	m.Spawn("card-3", "", events)
	defer m.Kill("card-3")

	err := m.Spawn("card-3", "", events)
	if err == nil {
		t.Error("expected error for duplicate spawn")
	}
}

func TestManager_KillNotFound(t *testing.T) {
	m := agent.NewManager("echo")
	err := m.Kill("nonexistent")
	if err == nil {
		t.Error("expected error for killing nonexistent process")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/agent/ -v -run TestManager`
Expected: FAIL — `NewManager` not defined.

- [ ] **Step 3: Write Manager implementation**

```go
// backend/internal/agent/manager.go
package agent

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"sync"
)

type processEntry struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	cancel func()
}

type Manager struct {
	claudeBin string
	mu        sync.RWMutex
	procs     map[string]*processEntry
	exited    map[string]bool
}

func NewManager(claudeBin string) *Manager {
	return &Manager{
		claudeBin: claudeBin,
		procs:     make(map[string]*processEntry),
		exited:    make(map[string]bool),
	}
}

const agentSystemPrompt = `You are an AI agent working on a kanban card task.

During the Backlog phase: Help the user define the task. Ask clarifying questions. As the task becomes clear, update the card fields by outputting JSON blocks like: {"card_update": {"title": "...", "description": "...", "acceptanceCriteria": [...], "complexity": "...", "relevantFiles": [...]}}.

When the user clicks Start Development: Create a git worktree with 'git worktree add ../agent-desk-worktrees/<card-id> -b agent/<card-id>'. Change to that directory. Begin implementation following TDD (write failing test, implement, verify, commit).

When your implementation is complete: Output exactly READY_FOR_REVIEW on its own line to signal that you are done.

If the user rejects during Review: Read their feedback, continue working, and signal READY_FOR_REVIEW again when done.

When the user clicks Approve: Run 'gh pr create --base master --head agent/<card-id>' and output the PR URL.`

func (m *Manager) Spawn(cardID string, sessionID string, events chan<- StreamEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.procs[cardID]; exists {
		return fmt.Errorf("process already running for card %q", cardID)
	}

	args := []string{"-p", "--output-format", "stream-json", "--append-system-prompt", agentSystemPrompt}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}

	cmd := exec.Command(m.claudeBin, args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start process: %w", err)
	}

	entry := &processEntry{
		cmd:   cmd,
		stdin: stdin,
	}
	m.procs[cardID] = entry

	// Read stdout in background, parse events, send to channel
	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}
			ev, err := ParseStreamEvent(line)
			if err != nil {
				continue
			}
			events <- ev
		}
		cmd.Wait()
		m.mu.Lock()
		delete(m.procs, cardID)
		m.exited[cardID] = true
		m.mu.Unlock()
		close(events)
	}()

	return nil
}

func (m *Manager) Send(cardID string, message string) error {
	m.mu.RLock()
	entry, ok := m.procs[cardID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("no process for card %q", cardID)
	}
	_, err := fmt.Fprintf(entry.stdin, "%s\n", message)
	return err
}

func (m *Manager) Kill(cardID string) error {
	m.mu.Lock()
	entry, ok := m.procs[cardID]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("no process for card %q", cardID)
	}
	delete(m.procs, cardID)
	m.exited[cardID] = true
	m.mu.Unlock()

	entry.stdin.Close()
	return entry.cmd.Process.Kill()
}

func (m *Manager) IsRunning(cardID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.procs[cardID]
	return ok
}

func (m *Manager) HasExited(cardID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.exited[cardID]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/agent/ -v -run TestManager -timeout 10s`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add internal/agent/manager.go internal/agent/manager_test.go
git commit -m "feat(backend): add Claude CLI process manager with spawn/kill/send"
```

---

## Task 8: WebSocket Hub

**Files:**
- Create: `backend/internal/websocket/hub.go`
- Create: `backend/internal/websocket/hub_test.go`

- [ ] **Step 1: Add nhooyr.io/websocket dependency**

Run: `cd backend && go get nhooyr.io/websocket`

- [ ] **Step 2: Write failing test for hub Subscribe and Broadcast**

```go
// backend/internal/websocket/hub_test.go
package websocket_test

import (
	"testing"

	ws "github.com/jackuait/agent-desk/backend/internal/websocket"
)

func TestHub_SubscribeAndBroadcast(t *testing.T) {
	hub := ws.NewHub()

	ch := make(chan []byte, 10)
	hub.Subscribe("card-1", ch)

	hub.Broadcast("card-1", []byte(`{"type":"token","content":"hello"}`))

	select {
	case msg := <-ch:
		if string(msg) != `{"type":"token","content":"hello"}` {
			t.Errorf("unexpected message: %s", msg)
		}
	default:
		t.Error("expected message on channel")
	}
}

func TestHub_Unsubscribe(t *testing.T) {
	hub := ws.NewHub()
	ch := make(chan []byte, 10)
	hub.Subscribe("card-1", ch)
	hub.Unsubscribe("card-1", ch)

	hub.Broadcast("card-1", []byte("should not receive"))

	select {
	case msg := <-ch:
		t.Errorf("unexpected message after unsubscribe: %s", msg)
	default:
		// correct — nothing received
	}
}

func TestHub_MultipleSubscribers(t *testing.T) {
	hub := ws.NewHub()
	ch1 := make(chan []byte, 10)
	ch2 := make(chan []byte, 10)
	hub.Subscribe("card-1", ch1)
	hub.Subscribe("card-1", ch2)

	hub.Broadcast("card-1", []byte("msg"))

	for _, ch := range []chan []byte{ch1, ch2} {
		select {
		case <-ch:
		default:
			t.Error("expected message on subscriber")
		}
	}
}

func TestHub_BroadcastToWrongCard(t *testing.T) {
	hub := ws.NewHub()
	ch := make(chan []byte, 10)
	hub.Subscribe("card-1", ch)

	hub.Broadcast("card-2", []byte("wrong card"))

	select {
	case msg := <-ch:
		t.Errorf("unexpected message: %s", msg)
	default:
		// correct
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && go test ./internal/websocket/ -v`
Expected: FAIL — package doesn't exist yet.

- [ ] **Step 4: Write Hub implementation**

```go
// backend/internal/websocket/hub.go
package websocket

import "sync"

type Hub struct {
	mu          sync.RWMutex
	subscribers map[string][]chan []byte
}

func NewHub() *Hub {
	return &Hub{
		subscribers: make(map[string][]chan []byte),
	}
}

func (h *Hub) Subscribe(cardID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.subscribers[cardID] = append(h.subscribers[cardID], ch)
}

func (h *Hub) Unsubscribe(cardID string, ch chan []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs := h.subscribers[cardID]
	for i, sub := range subs {
		if sub == ch {
			h.subscribers[cardID] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	if len(h.subscribers[cardID]) == 0 {
		delete(h.subscribers, cardID)
	}
}

func (h *Hub) Broadcast(cardID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subscribers[cardID] {
		select {
		case ch <- msg:
		default:
			// skip slow subscribers
		}
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && go test ./internal/websocket/ -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/websocket/hub.go internal/websocket/hub_test.go
git commit -m "feat(backend): add WebSocket hub with pub/sub per card"
```

---

## Task 9: WebSocket Handler

**Files:**
- Create: `backend/internal/websocket/handler.go`
- Create: `backend/internal/websocket/handler_test.go`

- [ ] **Step 1: Write failing test for WebSocket handler upgrade and message round-trip**

```go
// backend/internal/websocket/handler_test.go
package websocket_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	ws "github.com/jackuait/agent-desk/backend/internal/websocket"
	"nhooyr.io/websocket"
)

func TestHandler_ConnectAndReceiveToken(t *testing.T) {
	store := card.NewStore()
	svc := card.NewService(store)
	c := store.Create("Test")
	hub := ws.NewHub()
	mgr := agent.NewManager("echo") // echo won't produce valid stream-json, but tests hub wiring

	h := ws.NewHandler(hub, mgr, svc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/cards/{id}/ws", h.HandleWebSocket)
	server := httptest.NewServer(mux)
	defer server.Close()

	url := strings.Replace(server.URL, "http://", "ws://", 1) + "/api/cards/" + c.ID + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatalf("failed to connect: %v", err)
	}
	defer conn.CloseNow()

	// Send a token through the hub to test the broadcast path
	tokenMsg, _ := json.Marshal(map[string]string{"type": "token", "content": "hi"})
	hub.Broadcast(c.ID, tokenMsg)

	_, msg, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("failed to read: %v", err)
	}
	if !strings.Contains(string(msg), "hi") {
		t.Errorf("expected token with 'hi', got: %s", msg)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/websocket/ -v -run TestHandler`
Expected: FAIL — `NewHandler` not defined.

- [ ] **Step 3: Write WebSocket handler**

```go
// backend/internal/websocket/handler.go
package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
	"nhooyr.io/websocket"
)

type Handler struct {
	hub     *Hub
	manager *agent.Manager
	cardSvc *card.Service
}

func NewHandler(hub *Hub, manager *agent.Manager, cardSvc *card.Service) *Handler {
	return &Handler{hub: hub, manager: manager, cardSvc: cardSvc}
}

type clientMessage struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	cardID := r.PathValue("id")
	c, err := h.cardSvc.GetCard(cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow all origins for development
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}
	defer conn.CloseNow()

	// Ensure a Claude Code process is running for this card
	if !h.manager.IsRunning(cardID) {
		events := make(chan agent.StreamEvent, 256)
		if err := h.manager.Spawn(cardID, c.SessionID, events); err != nil {
			log.Printf("failed to spawn agent for card %s: %v", cardID, err)
		} else {
			h.StartEventBridge(cardID, events)
		}
	}

	// Subscribe to hub for this card
	sendCh := make(chan []byte, 256)
	h.hub.Subscribe(cardID, sendCh)
	defer h.hub.Unsubscribe(cardID, sendCh)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Writer goroutine: hub → WebSocket
	go func() {
		for {
			select {
			case msg, ok := <-sendCh:
				if !ok {
					return
				}
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Reader loop: WebSocket → process manager
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			break
		}

		var msg clientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "message":
			h.manager.Send(cardID, msg.Content)
		case "start":
			h.handleStart(cardID)
		case "approve":
			h.handleApprove(cardID)
		case "merge":
			h.handleMerge(cardID)
		}
	}
}

func (h *Handler) handleStart(cardID string) {
	c, err := h.cardSvc.StartDevelopment(cardID)
	if err != nil {
		h.broadcastError(cardID, err.Error())
		return
	}
	statusMsg, _ := json.Marshal(map[string]string{"type": "status", "column": string(c.Column)})
	h.hub.Broadcast(cardID, statusMsg)
	h.manager.Send(cardID, "The user has clicked Start Development. Create a git worktree and begin implementing the task described in our conversation. Follow TDD.")
}

func (h *Handler) handleApprove(cardID string) {
	h.manager.Send(cardID, "The user has approved your work. Run `gh pr create --base master --head agent/"+cardID+"` and return the PR URL.")
}

func (h *Handler) handleMerge(cardID string) {
	c, err := h.cardSvc.GetCard(cardID)
	if err != nil {
		h.broadcastError(cardID, err.Error())
		return
	}
	if c.PRUrl == "" {
		h.broadcastError(cardID, "no PR URL set")
		return
	}
	_, err = h.cardSvc.MoveToDone(cardID)
	if err != nil {
		h.broadcastError(cardID, err.Error())
		return
	}
	statusMsg, _ := json.Marshal(map[string]string{"type": "status", "column": string(card.Done)})
	h.hub.Broadcast(cardID, statusMsg)
}

func (h *Handler) broadcastError(cardID string, msg string) {
	errMsg, _ := json.Marshal(map[string]string{"type": "error", "message": msg})
	h.hub.Broadcast(cardID, errMsg)
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/cards/{id}/ws", h.HandleWebSocket)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/websocket/ -v -timeout 10s`
Expected: PASS

- [ ] **Step 5: Wire WebSocket handler into main.go**

Add to `backend/cmd/server/main.go` after the existing handler setup:

```go
// Add these imports
import (
	"github.com/jackuait/agent-desk/backend/internal/agent"
	ws "github.com/jackuait/agent-desk/backend/internal/websocket"
)

// Add after boardHandler setup:
	agentMgr := agent.NewManager("claude")
	wsHub := ws.NewHub()
	wsHandler := ws.NewHandler(wsHub, agentMgr, cardSvc)

// Add after boardHandler.RegisterRoutes(mux):
	wsHandler.RegisterRoutes(mux)
```

- [ ] **Step 6: Run all backend tests**

Run: `cd backend && go build ./... && go test ./... -timeout 30s`
Expected: Build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd backend && git add -A
git commit -m "feat(backend): add WebSocket handler with message routing to Claude process"
```

---

## Task 10: Worktree Service

**Files:**
- Create: `backend/internal/worktree/service.go`
- Create: `backend/internal/worktree/service_test.go`

- [ ] **Step 1: Write failing test for worktree Create and Remove**

```go
// backend/internal/worktree/service_test.go
package worktree_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/worktree"
)

func setupGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@test.com", "GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@test.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v failed: %s\n%s", args, err, out)
		}
	}
	run("init")
	run("commit", "--allow-empty", "-m", "init")
	return dir
}

func TestService_CreateAndRemove(t *testing.T) {
	repoDir := setupGitRepo(t)
	worktreeBase := t.TempDir()
	svc := worktree.NewService(repoDir, worktreeBase)

	path, branch, err := svc.Create("card-test-1")
	if err != nil {
		t.Fatalf("failed to create worktree: %v", err)
	}
	if branch != "agent/card-test-1" {
		t.Errorf("expected branch %q, got %q", "agent/card-test-1", branch)
	}
	expectedPath := filepath.Join(worktreeBase, "card-test-1")
	if path != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, path)
	}
	// Verify directory exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("expected worktree directory to exist")
	}

	// Remove
	err = svc.Remove("card-test-1")
	if err != nil {
		t.Fatalf("failed to remove worktree: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected worktree directory to be removed")
	}
}

func TestService_CreateDuplicate(t *testing.T) {
	repoDir := setupGitRepo(t)
	worktreeBase := t.TempDir()
	svc := worktree.NewService(repoDir, worktreeBase)

	svc.Create("card-dup")
	defer svc.Remove("card-dup")

	_, _, err := svc.Create("card-dup")
	if err == nil {
		t.Error("expected error for duplicate worktree")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./internal/worktree/ -v`
Expected: FAIL — package doesn't exist.

- [ ] **Step 3: Write worktree service**

```go
// backend/internal/worktree/service.go
package worktree

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

type Service struct {
	repoDir      string
	worktreeBase string
}

func NewService(repoDir, worktreeBase string) *Service {
	return &Service{repoDir: repoDir, worktreeBase: worktreeBase}
}

func (s *Service) Create(cardID string) (path string, branch string, err error) {
	path = filepath.Join(s.worktreeBase, cardID)
	branch = "agent/" + cardID

	cmd := exec.Command("git", "worktree", "add", path, "-b", branch)
	cmd.Dir = s.repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("git worktree add: %s: %w", out, err)
	}
	return path, branch, nil
}

func (s *Service) Remove(cardID string) error {
	path := filepath.Join(s.worktreeBase, cardID)
	branch := "agent/" + cardID

	cmd := exec.Command("git", "worktree", "remove", path, "--force")
	cmd.Dir = s.repoDir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree remove: %s: %w", out, err)
	}

	cmd = exec.Command("git", "branch", "-D", branch)
	cmd.Dir = s.repoDir
	cmd.CombinedOutput() // best-effort branch cleanup

	return nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/worktree/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add internal/worktree/
git commit -m "feat(backend): add git worktree service for create/remove"
```

---

## Task 11: Frontend Domain Types + API Client

**Files:**
- Modify: `frontend/src/shared/types/domain.ts`
- Create: `frontend/src/shared/api/client.ts`
- Create: `frontend/src/shared/api/client.test.ts`
- Delete: `frontend/src/shared/api/agent-provider.ts`

- [ ] **Step 1: Update domain types**

```typescript
// frontend/src/shared/types/domain.ts — REPLACE entire file
export interface Board {
  id: string;
  title: string;
  columns: Column[];
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export type CardColumn = "backlog" | "in_progress" | "review" | "done";

export interface Card {
  id: string;
  title: string;
  description: string;
  column: CardColumn;
  acceptanceCriteria: string[];
  complexity: string;
  relevantFiles: string[];
  sessionId: string;
  worktreePath: string;
  branchName: string;
  prUrl: string;
  createdAt: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// WebSocket message types
export type WSClientMessage =
  | { type: "message"; content: string }
  | { type: "start" }
  | { type: "approve" }
  | { type: "merge" };

export type WSServerMessage =
  | { type: "token"; content: string }
  | { type: "message"; role: string; content: string; id: string; timestamp: number }
  | { type: "card_update"; fields: Partial<Card> }
  | { type: "status"; column: CardColumn }
  | { type: "worktree"; path: string }
  | { type: "pr"; url: string }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Delete agent-provider.ts**

```bash
rm frontend/src/shared/api/agent-provider.ts
```

- [ ] **Step 3: Write failing test for API client**

```typescript
// frontend/src/shared/api/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { api } from "./client";

let mockFetch: ReturnType<typeof import("vitest").vi.fn>;

beforeEach(() => {
  mockFetch = globalThis.fetch = import("vitest").then(v => v.vi.fn()) as any;
  // Actually, let's use vi directly:
});

// Simpler approach: mock fetch inline
describe("api", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("createCard posts to /api/cards", async () => {
    const mockCard = { id: "card-1", title: "Test", column: "backlog" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCard),
    });

    const result = await api.createCard("Test");
    expect(fetch).toHaveBeenCalledWith("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });
    expect(result.id).toBe("card-1");
  });

  it("listCards fetches /api/cards", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "card-1" }]),
    });

    const result = await api.listCards();
    expect(result).toHaveLength(1);
  });

  it("getBoard fetches /api/board", async () => {
    const mockBoard = { id: "board-1", columns: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBoard),
    });

    const result = await api.getBoard();
    expect(result.id).toBe("board-1");
  });

  it("deleteCard sends DELETE", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await api.deleteCard("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1", { method: "DELETE" });
  });

  it("mergeCard posts to /api/cards/:id/merge", async () => {
    const mockCard = { id: "card-1", column: "done" };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCard),
    });

    const result = await api.mergeCard("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1/merge", { method: "POST" });
    expect(result.column).toBe("done");
  });
});
```

- [ ] **Step 4: Write API client**

```typescript
// frontend/src/shared/api/client.ts
import type { Board, Card } from "../types/domain";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  createCard(title: string): Promise<Card> {
    return request("/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },

  listCards(): Promise<Card[]> {
    return request("/cards");
  },

  getCard(id: string): Promise<Card> {
    return request(`/cards/${id}`);
  },

  deleteCard(id: string): Promise<void> {
    return request(`/cards/${id}`, { method: "DELETE" });
  },

  mergeCard(id: string): Promise<Card> {
    return request(`/cards/${id}/merge`, { method: "POST" });
  },

  getBoard(): Promise<Board> {
    return request("/board");
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/shared/api/client.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd frontend && git add -A
git commit -m "feat(frontend): add domain types, API client, remove agent-provider"
```

---

## Task 12: useCardSocket WebSocket Hook

**Files:**
- Create: `frontend/src/shared/api/useCardSocket.ts`
- Create: `frontend/src/shared/api/useCardSocket.test.ts`

- [ ] **Step 1: Write failing test for useCardSocket**

```typescript
// frontend/src/shared/api/useCardSocket.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardSocket } from "./useCardSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCardSocket", () => {
  it("connects to the correct URL", () => {
    renderHook(() => useCardSocket("card-123"));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toContain("card-123");
  });

  it("reports connected status after open", async () => {
    const { result } = renderHook(() => useCardSocket("card-123"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.status).toBe("connected");
  });

  it("accumulates messages from server", async () => {
    const { result } = renderHook(() => useCardSocket("card-123"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.onmessage?.({
        data: JSON.stringify({ type: "message", role: "assistant", content: "Hello", id: "msg-1", timestamp: 123 }),
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("Hello");
  });

  it("sendMessage sends JSON to WebSocket", async () => {
    const { result } = renderHook(() => useCardSocket("card-123"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.sendMessage("Hello agent");
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "message", content: "Hello agent" });
  });

  it("sendAction sends action type", async () => {
    const { result } = renderHook(() => useCardSocket("card-123"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.sendAction("start");
    });

    const ws = MockWebSocket.instances[0];
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "start" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test -- --run src/shared/api/useCardSocket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write useCardSocket hook**

```typescript
// frontend/src/shared/api/useCardSocket.ts
import { useState, useEffect, useCallback, useRef } from "react";
import type { Card, CardColumn, Message, WSClientMessage, WSServerMessage } from "../types/domain";

export interface UseCardSocketResult {
  messages: Message[];
  streamingContent: string;
  sendMessage: (content: string) => void;
  sendAction: (type: "start" | "approve" | "merge") => void;
  cardUpdates: Partial<Card>;
  currentColumn: CardColumn | null;
  prUrl: string | null;
  worktreePath: string | null;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
}

export function useCardSocket(cardId: string): UseCardSocketResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [cardUpdates, setCardUpdates] = useState<Partial<Card>>({});
  const [currentColumn, setCurrentColumn] = useState<CardColumn | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/cards/${cardId}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setError("WebSocket connection failed");

    ws.onmessage = (event: MessageEvent) => {
      const msg: WSServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "token":
          setStreamingContent((prev) => prev + msg.content);
          break;
        case "message":
          setStreamingContent("");
          setMessages((prev) => [
            ...prev,
            { id: msg.id, role: msg.role as "user" | "assistant", content: msg.content, timestamp: msg.timestamp },
          ]);
          break;
        case "card_update":
          setCardUpdates((prev) => ({ ...prev, ...msg.fields }));
          break;
        case "status":
          setCurrentColumn(msg.column);
          break;
        case "pr":
          setPrUrl(msg.url);
          break;
        case "worktree":
          setWorktreePath(msg.path);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [cardId]);

  const sendMessage = useCallback((content: string) => {
    const msg: WSClientMessage = { type: "message", content };
    wsRef.current?.send(JSON.stringify(msg));
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content, timestamp: Date.now() },
    ]);
  }, []);

  const sendAction = useCallback((type: "start" | "approve" | "merge") => {
    const msg: WSClientMessage = { type };
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  return {
    messages,
    streamingContent,
    sendMessage,
    sendAction,
    cardUpdates,
    currentColumn,
    prUrl,
    worktreePath,
    status,
    error,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/shared/api/useCardSocket.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/shared/api/useCardSocket.ts src/shared/api/useCardSocket.test.ts
git commit -m "feat(frontend): add useCardSocket WebSocket hook"
```

---

## Task 13: ChatMessage Component

**Files:**
- Create: `frontend/src/features/chat/ChatMessage.tsx`
- Create: `frontend/src/features/chat/ChatMessage.module.css`
- Create: `frontend/src/features/chat/ChatMessage.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/features/chat/ChatMessage.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders user message with content", () => {
    render(<ChatMessage role="user" content="Hello agent" />);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders assistant message with content", () => {
    render(<ChatMessage role="assistant" content="Hi there" />);
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders streaming content when provided", () => {
    render(<ChatMessage role="assistant" content="" streaming="Working on..." />);
    expect(screen.getByText("Working on...")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test -- --run src/features/chat/ChatMessage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write ChatMessage component**

```typescript
// frontend/src/features/chat/ChatMessage.tsx
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  streaming?: string;
}

export function ChatMessage({ role, content, streaming }: ChatMessageProps) {
  const displayContent = streaming || content;
  const isUser = role === "user";

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.bubble}>
        <span className={styles.sender}>{isUser ? "You" : "Agent"}</span>
        <div className={styles.content}>{displayContent}</div>
      </div>
    </div>
  );
}
```

```css
/* frontend/src/features/chat/ChatMessage.module.css */
.message {
  margin-bottom: 12px;
}

.user {
  display: flex;
  justify-content: flex-start;
}

.assistant {
  display: flex;
  justify-content: flex-start;
}

.bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.user .bubble {
  background: var(--bg-hover);
}

.assistant .bubble {
  background: var(--accent-blue-bg);
}

.sender {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/features/chat/ChatMessage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/features/chat/ChatMessage.tsx src/features/chat/ChatMessage.module.css src/features/chat/ChatMessage.test.tsx
git commit -m "feat(frontend): add ChatMessage bubble component"
```

---

## Task 14: ChatPanel Rework

**Files:**
- Modify: `frontend/src/features/chat/ChatPanel.tsx`
- Create: `frontend/src/features/chat/ChatPanel.module.css`
- Modify: `frontend/src/features/chat/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing test for reworked ChatPanel**

```typescript
// frontend/src/features/chat/ChatPanel.test.tsx — REPLACE entire file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type { Message } from "../../shared/types/domain";

describe("ChatPanel", () => {
  const messages: Message[] = [
    { id: "1", role: "user", content: "Build a dashboard", timestamp: 100 },
    { id: "2", role: "assistant", content: "I'll build that for you", timestamp: 200 },
  ];
  const onSend = vi.fn();

  it("renders messages", () => {
    render(<ChatPanel messages={messages} streamingContent="" onSend={onSend} />);
    expect(screen.getByText("Build a dashboard")).toBeInTheDocument();
    expect(screen.getByText("I'll build that for you")).toBeInTheDocument();
  });

  it("renders streaming content", () => {
    render(<ChatPanel messages={[]} streamingContent="Working..." onSend={onSend} />);
    expect(screen.getByText("Working...")).toBeInTheDocument();
  });

  it("calls onSend when submitting", async () => {
    const user = userEvent.setup();
    render(<ChatPanel messages={[]} streamingContent="" onSend={onSend} />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("clears input after send", async () => {
    const user = userEvent.setup();
    render(<ChatPanel messages={[]} streamingContent="" onSend={onSend} />);

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Hello{Enter}");
    expect(input).toHaveValue("");
  });

  it("disables input when readOnly", () => {
    render(<ChatPanel messages={messages} streamingContent="" onSend={onSend} readOnly />);
    expect(screen.getByPlaceholderText("Type a message...")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test -- --run src/features/chat/ChatPanel.test.tsx`
Expected: FAIL — ChatPanel doesn't accept props yet.

- [ ] **Step 3: Write reworked ChatPanel**

```typescript
// frontend/src/features/chat/ChatPanel.tsx — REPLACE entire file
import { useState, useRef, useEffect } from "react";
import type { Message } from "../../shared/types/domain";
import { ChatMessage } from "./ChatMessage";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  messages: Message[];
  streamingContent: string;
  onSend: (content: string) => void;
  readOnly?: boolean;
}

export function ChatPanel({ messages, streamingContent, onSend, readOnly }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className={styles.panel} data-testid="chat-panel">
      <div className={styles.messageList} ref={listRef} data-testid="message-list">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {streamingContent && (
          <ChatMessage role="assistant" content="" streaming={streamingContent} />
        )}
      </div>
      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={readOnly}
        />
        <button type="submit" className={styles.sendBtn} disabled={readOnly || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

```css
/* frontend/src/features/chat/ChatPanel.module.css */
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messageList {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.inputArea {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-card);
}

.input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-card);
  border-radius: 6px;
  font-size: 14px;
  font-family: var(--font);
  outline: none;
}

.input:focus {
  border-color: var(--accent-blue);
}

.sendBtn {
  padding: 8px 16px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.sendBtn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/features/chat/ChatPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/features/chat/
git commit -m "feat(frontend): rework ChatPanel with messages, streaming, and input"
```

---

## Task 15: CardModal + CardContent

**Files:**
- Create: `frontend/src/features/card/CardModal.tsx`
- Create: `frontend/src/features/card/CardModal.module.css`
- Create: `frontend/src/features/card/CardModal.test.tsx`
- Create: `frontend/src/features/card/CardContent.tsx`
- Create: `frontend/src/features/card/CardContent.module.css`
- Create: `frontend/src/features/card/CardContent.test.tsx`
- Modify: `frontend/src/features/card/index.ts`
- Delete: `frontend/src/features/card/CardDetail.tsx`
- Delete: `frontend/src/features/card/CardDetail.test.tsx`

- [ ] **Step 1: Write failing test for CardContent**

```typescript
// frontend/src/features/card/CardContent.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardContent } from "./CardContent";
import type { Card } from "../../shared/types/domain";

const baseCard: Card = {
  id: "card-1",
  title: "Build dashboard",
  description: "User dashboard with stats",
  column: "backlog",
  acceptanceCriteria: ["Fast loading", "Has tests"],
  complexity: "Medium",
  relevantFiles: ["src/dashboard.tsx"],
  sessionId: "",
  worktreePath: "",
  branchName: "",
  prUrl: "",
  createdAt: 1000,
};

describe("CardContent", () => {
  it("renders card title and description", () => {
    render(<CardContent card={baseCard} onStart={vi.fn()} onApprove={vi.fn()} onMerge={vi.fn()} />);
    expect(screen.getByText("Build dashboard")).toBeInTheDocument();
    expect(screen.getByText("User dashboard with stats")).toBeInTheDocument();
  });

  it("shows Start Development button in backlog", () => {
    render(<CardContent card={baseCard} onStart={vi.fn()} onApprove={vi.fn()} onMerge={vi.fn()} />);
    expect(screen.getByRole("button", { name: /start development/i })).toBeInTheDocument();
  });

  it("hides action buttons in in_progress", () => {
    const card = { ...baseCard, column: "in_progress" as const };
    render(<CardContent card={card} onStart={vi.fn()} onApprove={vi.fn()} onMerge={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /start development/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows Approve button in review", () => {
    const card = { ...baseCard, column: "review" as const };
    render(<CardContent card={card} onStart={vi.fn()} onApprove={vi.fn()} onMerge={vi.fn()} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  it("shows Merge button in review when PR exists", () => {
    const card = { ...baseCard, column: "review" as const, prUrl: "https://github.com/pr/1" };
    render(<CardContent card={card} onStart={vi.fn()} onApprove={vi.fn()} onMerge={vi.fn()} />);
    expect(screen.getByRole("button", { name: /merge/i })).toBeInTheDocument();
  });

  it("calls onStart when clicking Start Development", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<CardContent card={baseCard} onStart={onStart} onApprove={vi.fn()} onMerge={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /start development/i }));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && yarn test -- --run src/features/card/CardContent.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write CardContent component**

```typescript
// frontend/src/features/card/CardContent.tsx
import type { Card } from "../../shared/types/domain";
import styles from "./CardContent.module.css";

interface CardContentProps {
  card: Card;
  onStart: () => void;
  onApprove: () => void;
  onMerge: () => void;
}

export function CardContent({ card, onStart, onApprove, onMerge }: CardContentProps) {
  return (
    <div className={styles.content}>
      <div className={styles.header}>
        <span className={styles.badge}>{card.column.replace("_", " ")}</span>
        <span className={styles.cardId}>#{card.id.slice(0, 8)}</span>
      </div>

      <h3 className={styles.title}>{card.title}</h3>

      {card.description && (
        <div className={styles.section}>
          <div className={styles.label}>Description</div>
          <p className={styles.text}>{card.description}</p>
        </div>
      )}

      {card.acceptanceCriteria.length > 0 && (
        <div className={styles.section}>
          <div className={styles.label}>Acceptance Criteria</div>
          <ul className={styles.list}>
            {card.acceptanceCriteria.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {card.complexity && (
        <div className={styles.section}>
          <div className={styles.label}>Complexity</div>
          <span className={styles.tag}>{card.complexity}</span>
        </div>
      )}

      {card.relevantFiles.length > 0 && (
        <div className={styles.section}>
          <div className={styles.label}>Relevant Files</div>
          <div className={styles.files}>
            {card.relevantFiles.map((f, i) => (
              <div key={i} className={styles.file}>{f}</div>
            ))}
          </div>
        </div>
      )}

      {card.worktreePath && (
        <div className={styles.section}>
          <div className={styles.label}>Worktree</div>
          <div className={styles.file}>{card.worktreePath}</div>
        </div>
      )}

      {card.prUrl && (
        <div className={styles.section}>
          <div className={styles.label}>Pull Request</div>
          <a href={card.prUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
            {card.prUrl}
          </a>
        </div>
      )}

      <div className={styles.actions}>
        {card.column === "backlog" && (
          <button className={styles.primaryBtn} onClick={onStart}>
            Start Development
          </button>
        )}
        {card.column === "review" && !card.prUrl && (
          <button className={styles.primaryBtn} onClick={onApprove}>
            Approve
          </button>
        )}
        {card.column === "review" && card.prUrl && (
          <button className={styles.mergeBtn} onClick={onMerge}>
            Merge
          </button>
        )}
      </div>
    </div>
  );
}
```

```css
/* frontend/src/features/card/CardContent.module.css */
.content {
  padding: 24px;
  overflow-y: auto;
  height: 100%;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.badge {
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
  padding: 2px 8px;
  background: var(--accent-blue-bg);
  color: var(--accent-blue);
  border-radius: 4px;
}

.cardId {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}

.section {
  margin-bottom: 16px;
}

.label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0;
}

.list {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
  color: var(--text-secondary);
}

.list li {
  margin-bottom: 4px;
}

.tag {
  font-size: 13px;
  padding: 2px 8px;
  background: rgba(55, 53, 47, 0.06);
  border-radius: 4px;
}

.files {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-secondary);
}

.file {
  margin-bottom: 2px;
}

.link {
  font-size: 14px;
  color: var(--accent-blue);
  word-break: break-all;
}

.actions {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-card);
}

.primaryBtn {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.primaryBtn:hover {
  opacity: 0.9;
}

.mergeBtn {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  background: #2da44e;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.mergeBtn:hover {
  opacity: 0.9;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/features/card/CardContent.test.tsx`
Expected: PASS

- [ ] **Step 5: Write failing test for CardModal**

```typescript
// frontend/src/features/card/CardModal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardModal } from "./CardModal";
import type { Card, Message } from "../../shared/types/domain";

const card: Card = {
  id: "card-1",
  title: "Test",
  description: "",
  column: "backlog",
  acceptanceCriteria: [],
  complexity: "",
  relevantFiles: [],
  sessionId: "",
  worktreePath: "",
  branchName: "",
  prUrl: "",
  createdAt: 1000,
};

const messages: Message[] = [];

describe("CardModal", () => {
  it("renders card content and chat panel", () => {
    render(
      <CardModal
        card={card}
        messages={messages}
        streamingContent=""
        onSend={vi.fn()}
        onStart={vi.fn()}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("calls onClose when clicking overlay", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CardModal
        card={card}
        messages={messages}
        streamingContent=""
        onSend={vi.fn()}
        onStart={vi.fn()}
        onApprove={vi.fn()}
        onMerge={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Write CardModal component**

```typescript
// frontend/src/features/card/CardModal.tsx
import type { Card, Message } from "../../shared/types/domain";
import { CardContent } from "./CardContent";
import { ChatPanel } from "../chat";
import styles from "./CardModal.module.css";

interface CardModalProps {
  card: Card;
  messages: Message[];
  streamingContent: string;
  onSend: (content: string) => void;
  onStart: () => void;
  onApprove: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export function CardModal({
  card,
  messages,
  streamingContent,
  onSend,
  onStart,
  onApprove,
  onMerge,
  onClose,
}: CardModalProps) {
  return (
    <div className={styles.overlay} data-testid="modal-overlay" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.left}>
          <CardContent card={card} onStart={onStart} onApprove={onApprove} onMerge={onMerge} />
        </div>
        <div className={styles.right}>
          <ChatPanel
            messages={messages}
            streamingContent={streamingContent}
            onSend={onSend}
            readOnly={card.column === "done"}
          />
        </div>
      </div>
    </div>
  );
}
```

```css
/* frontend/src/features/card/CardModal.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  display: flex;
  width: 90vw;
  max-width: 1100px;
  height: 80vh;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.left {
  flex: 1;
  border-right: 1px solid var(--border-card);
  overflow-y: auto;
}

.right {
  flex: 1;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --run src/features/card/CardModal.test.tsx`
Expected: PASS

- [ ] **Step 8: Update index.ts and clean up**

```typescript
// frontend/src/features/card/index.ts — REPLACE entire file
export { CardModal } from "./CardModal";
export { CardContent } from "./CardContent";
```

```bash
rm frontend/src/features/card/CardDetail.tsx frontend/src/features/card/CardDetail.test.tsx
```

- [ ] **Step 9: Run all frontend tests**

Run: `cd frontend && yarn test`
Expected: Most pass. App.test.tsx and routes.tsx may need updating — fix in the next task.

- [ ] **Step 10: Commit**

```bash
cd frontend && git add -A
git commit -m "feat(frontend): add CardModal with split layout and CardContent panel"
```

---

## Task 16: Board Integration

**Files:**
- Modify: `frontend/src/features/board/BoardPage.tsx`
- Modify: `frontend/src/features/board/BoardPage.module.css`
- Modify: `frontend/src/features/board/BoardPage.test.tsx`
- Modify: `frontend/src/features/board/KanbanCard.tsx`
- Modify: `frontend/src/features/board/use-board.ts`
- Modify: `frontend/src/features/board/use-board.test.ts`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/app/App.test.tsx`

- [ ] **Step 1: Update use-board hook to support addCard, selectCard, and API integration**

```typescript
// frontend/src/features/board/use-board.ts — REPLACE entire file
import { useState, useCallback, useEffect } from "react";
import type { Board, Card } from "../../shared/types/domain";
import { api } from "../../shared/api/client";

const EMPTY_BOARD: Board = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

export interface UseBoardResult {
  board: Board;
  cards: Record<string, Card>;
  selectedCardId: string | null;
  enteringCards: Set<string>;
  exitingCards: Set<string>;
  workingCards: Set<string>;
  loading: boolean;
  createCard: (title: string) => Promise<Card>;
  selectCard: (cardId: string | null) => void;
  updateCard: (card: Card) => void;
  moveCardToColumn: (cardId: string, toColumn: string) => void;
  refresh: () => Promise<void>;
}

export function useBoard(): UseBoardResult {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [enteringCards, setEnteringCards] = useState<Set<string>>(new Set());
  const [exitingCards] = useState<Set<string>>(new Set());
  const [workingCards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [boardData, cardList] = await Promise.all([api.getBoard(), api.listCards()]);
      setBoard(boardData);
      const cardMap: Record<string, Card> = {};
      for (const c of cardList) {
        cardMap[c.id] = c;
      }
      setCards(cardMap);
    } catch {
      // silently fail on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCard = useCallback(async (title: string) => {
    const card = await api.createCard(title);
    setCards((prev) => ({ ...prev, [card.id]: card }));
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === "col-backlog" ? { ...col, cardIds: [...col.cardIds, card.id] } : col,
      ),
    }));
    setEnteringCards((prev) => new Set(prev).add(card.id));
    setTimeout(() => {
      setEnteringCards((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }, 500);
    return card;
  }, []);

  const selectCard = useCallback((cardId: string | null) => {
    setSelectedCardId(cardId);
  }, []);

  const updateCard = useCallback((card: Card) => {
    setCards((prev) => ({ ...prev, [card.id]: card }));
  }, []);

  const moveCardToColumn = useCallback((cardId: string, toColumnId: string) => {
    setBoard((prev) => {
      const fromCol = prev.columns.find((c) => c.cardIds.includes(cardId));
      if (!fromCol || fromCol.id === toColumnId) return prev;
      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === fromCol.id) return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) };
          if (col.id === toColumnId) return { ...col, cardIds: [...col.cardIds, cardId] };
          return col;
        }),
      };
    });
  }, []);

  return {
    board,
    cards,
    selectedCardId,
    enteringCards,
    exitingCards,
    workingCards,
    loading,
    createCard,
    selectCard,
    updateCard,
    moveCardToColumn,
    refresh,
  };
}
```

- [ ] **Step 2: Update BoardPage to use modal and card creation**

```typescript
// frontend/src/features/board/BoardPage.tsx — REPLACE entire file
import { useState } from "react";
import { useBoard } from "./use-board";
import { Column } from "./Column";
import { CardModal } from "../card";
import { useCardSocket } from "../../shared/api/useCardSocket";
import styles from "./BoardPage.module.css";

function CardModalWrapper({
  cardId,
  cards,
  updateCard,
  moveCardToColumn,
  onClose,
}: {
  cardId: string;
  cards: Record<string, import("../../shared/types/domain").Card>;
  updateCard: (card: import("../../shared/types/domain").Card) => void;
  moveCardToColumn: (cardId: string, toColumn: string) => void;
  onClose: () => void;
}) {
  const card = cards[cardId];
  const socket = useCardSocket(cardId);

  // Apply card_update events
  const displayCard = { ...card, ...socket.cardUpdates };
  if (socket.currentColumn) {
    displayCard.column = socket.currentColumn;
  }
  if (socket.prUrl) {
    displayCard.prUrl = socket.prUrl;
  }

  return (
    <CardModal
      card={displayCard}
      messages={socket.messages}
      streamingContent={socket.streamingContent}
      onSend={socket.sendMessage}
      onStart={() => socket.sendAction("start")}
      onApprove={() => socket.sendAction("approve")}
      onMerge={() => socket.sendAction("merge")}
      onClose={onClose}
    />
  );
}

export function BoardPage() {
  const { board, cards, selectedCardId, enteringCards, exitingCards, workingCards, createCard, selectCard, updateCard, moveCardToColumn } = useBoard();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateCard() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const card = await createCard("New task");
      selectCard(card.id);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Agent Desk</h1>
          <p className={styles.subtitle}>Live agent operations</p>
        </div>
        <button className={styles.createBtn} onClick={handleCreateCard} disabled={isCreating}>
          + New Card
        </button>
      </header>
      <div className={styles.board} data-testid="board-container">
        {board.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={cards}
            enteringCards={enteringCards}
            exitingCards={exitingCards}
            workingCards={workingCards}
            onCardClick={selectCard}
          />
        ))}
      </div>
      {selectedCardId && cards[selectedCardId] && (
        <CardModalWrapper
          cardId={selectedCardId}
          cards={cards}
          updateCard={updateCard}
          moveCardToColumn={moveCardToColumn}
          onClose={() => selectCard(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update Column and KanbanCard to support onClick**

Add `onCardClick` prop to Column:

```typescript
// In frontend/src/features/board/Column.tsx — add onCardClick prop
interface ColumnProps {
  column: ColumnType;
  cards: Record<string, Card>;
  enteringCards?: Set<string>;
  exitingCards?: Set<string>;
  workingCards?: Set<string>;
  onCardClick?: (cardId: string) => void;
}
```

Pass it through to KanbanCard:

```typescript
<KanbanCard
  key={cardId}
  card={card}
  columnId={column.id}
  isEntering={enteringCards?.has(cardId)}
  isExiting={exitingCards?.has(cardId)}
  isWorking={workingCards?.has(cardId)}
  onClick={() => onCardClick?.(cardId)}
/>
```

Add `onClick` prop to KanbanCard:

```typescript
// In frontend/src/features/board/KanbanCard.tsx — add onClick prop
interface KanbanCardProps {
  card: Card;
  columnId?: string;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
  onClick?: () => void;
}

// In the article element:
<article className={classNames} onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }}>
```

- [ ] **Step 4: Update BoardPage.module.css**

Add create button styles:

```css
/* Append to frontend/src/features/board/BoardPage.module.css */

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.createBtn {
  padding: 8px 16px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.createBtn:hover {
  opacity: 0.9;
}

.createBtn:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 5: Update routes.tsx — remove card detail route**

```typescript
// frontend/src/app/routes.tsx — REPLACE entire file
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const BoardPage = lazy(() =>
  import("../features/board").then((m) => ({ default: m.BoardPage }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
      </Routes>
    </Suspense>
  );
}
```

- [ ] **Step 6: Update use-board.test.ts for new API**

```typescript
// frontend/src/features/board/use-board.test.ts — REPLACE entire file
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBoard } from "./use-board";

// Mock the API client
vi.mock("../../shared/api/client", () => ({
  api: {
    getBoard: vi.fn().mockResolvedValue({
      id: "board-1",
      title: "Agent Desk",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: [] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    }),
    listCards: vi.fn().mockResolvedValue([]),
    createCard: vi.fn().mockResolvedValue({
      id: "card-new",
      title: "New task",
      column: "backlog",
      description: "",
      acceptanceCriteria: [],
      complexity: "",
      relevantFiles: [],
      sessionId: "",
      worktreePath: "",
      branchName: "",
      prUrl: "",
      createdAt: 1000,
    }),
  },
}));

describe("useBoard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial board with four columns", async () => {
    const { result } = renderHook(() => useBoard());
    await act(async () => {});
    expect(result.current.board.columns).toHaveLength(4);
  });

  it("creates a card and adds it to backlog", async () => {
    const { result } = renderHook(() => useBoard());
    await act(async () => {});

    let card: any;
    await act(async () => {
      card = await result.current.createCard("New task");
    });

    expect(card.id).toBe("card-new");
    expect(result.current.cards["card-new"]).toBeDefined();
    const backlog = result.current.board.columns.find((c) => c.id === "col-backlog")!;
    expect(backlog.cardIds).toContain("card-new");
  });

  it("selects and deselects a card", async () => {
    const { result } = renderHook(() => useBoard());
    await act(async () => {});

    act(() => result.current.selectCard("card-1"));
    expect(result.current.selectedCardId).toBe("card-1");

    act(() => result.current.selectCard(null));
    expect(result.current.selectedCardId).toBeNull();
  });
});
```

- [ ] **Step 7: Update App.test.tsx**

```typescript
// frontend/src/app/App.test.tsx — REPLACE entire file
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

vi.mock("../shared/api/client", () => ({
  api: {
    getBoard: vi.fn().mockResolvedValue({
      id: "board-1",
      title: "Agent Desk",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: [] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    }),
    listCards: vi.fn().mockResolvedValue([]),
  },
}));

describe("App", () => {
  it("renders without crashing", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Update BoardPage.test.tsx**

```typescript
// frontend/src/features/board/BoardPage.test.tsx — REPLACE entire file
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { BoardPage } from "./BoardPage";

vi.mock("../../shared/api/client", () => ({
  api: {
    getBoard: vi.fn().mockResolvedValue({
      id: "board-1",
      title: "Agent Desk",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: [] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    }),
    listCards: vi.fn().mockResolvedValue([]),
  },
}));

describe("BoardPage", () => {
  it("renders the heading", async () => {
    renderWithRouter(<BoardPage />);
    expect(await screen.findByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });

  it("renders the board container", async () => {
    renderWithRouter(<BoardPage />);
    expect(await screen.findByTestId("board-container")).toBeInTheDocument();
  });

  it("renders all four columns", async () => {
    renderWithRouter(<BoardPage />);
    expect(await screen.findByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders new card button", async () => {
    renderWithRouter(<BoardPage />);
    expect(await screen.findByRole("button", { name: /new card/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run all frontend tests**

Run: `cd frontend && yarn test`
Expected: PASS

- [ ] **Step 10: Run frontend build + lint**

Run: `cd frontend && yarn build && yarn lint`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(frontend): integrate board with API, modal, and WebSocket chat"
```

---

## Task 17: Final Backend Wiring + Agent Event Bridge

**Files:**
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/internal/websocket/handler.go`

This task wires the agent process manager events to the WebSocket hub, so that when a Claude Code process emits tokens or messages, they get broadcast to all WebSocket connections for that card.

- [ ] **Step 1: Add event bridge function to WebSocket handler**

Add a method to `Handler` that starts a goroutine listening to the agent process events and broadcasting to the hub:

```go
// Add to backend/internal/websocket/handler.go

func (h *Handler) StartEventBridge(cardID string, events <-chan agent.StreamEvent) {
	go func() {
		var sessionCaptured bool
		for ev := range events {
			// Capture session ID on first event
			if !sessionCaptured && ev.SessionID != "" {
				h.cardSvc.SetSessionID(cardID, ev.SessionID)
				sessionCaptured = true
			}

			switch ev.Type {
			case agent.EventTextDelta:
				msg, _ := json.Marshal(map[string]string{"type": "token", "content": ev.Text})
				h.hub.Broadcast(cardID, msg)
				// Detect READY_FOR_REVIEW signal in text
				if strings.Contains(ev.Text, "READY_FOR_REVIEW") {
					if c, err := h.cardSvc.MoveToReview(cardID); err == nil {
						statusMsg, _ := json.Marshal(map[string]string{"type": "status", "column": string(c.Column)})
						h.hub.Broadcast(cardID, statusMsg)
					}
				}
			case agent.EventMessageStop:
				// Signal end of message — frontend assembles from tokens
				msg, _ := json.Marshal(map[string]string{"type": "message_end"})
				h.hub.Broadcast(cardID, msg)
			case agent.EventResult:
				msg, _ := json.Marshal(map[string]string{"type": "message", "role": "assistant", "content": ev.Text, "id": "result", "timestamp": "0"})
				h.hub.Broadcast(cardID, msg)
			}
		}
	}()
}
```

- [ ] **Step 2: Update main.go with complete wiring**

```go
// backend/cmd/server/main.go — ensure all imports and setup are present
// The agent manager, hub, and WebSocket handler should already be wired from Task 9.
// Just verify the final state compiles and runs.
```

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && go build ./... && go test ./... -timeout 30s`
Expected: Build and all tests pass.

- [ ] **Step 4: Commit**

```bash
cd backend && git add -A
git commit -m "feat(backend): wire agent event bridge to WebSocket hub"
```

---

## Task 18: Completion Checklist

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && go test ./... -v`
Expected: All PASS

- [ ] **Step 2: Run backend build**

Run: `cd backend && go build ./...`
Expected: Success

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && yarn test`
Expected: All PASS

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && yarn build`
Expected: Success

- [ ] **Step 5: Run frontend lint**

Run: `cd frontend && yarn lint`
Expected: Clean

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete agent card lifecycle vertical slice"
```
