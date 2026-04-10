# Agent Desk Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a scalable React + Go project for a kanban board where cards are agent conversations.

**Architecture:** Flat feature-based frontend (React, Vite, TypeScript) + domain-oriented Go backend (stdlib `net/http`). All placeholder components with tests; interfaces only for persistence and agent integration.

**Tech Stack:** React (latest), Vite (latest), TypeScript (latest), Vitest, React Testing Library, Playwright (config only), Go (latest), ESLint flat config, Yarn 4.x, CSS Modules.

**Parallelism map:**
```
Task 1 (project init)
  ├── Task 2 (Go init) ─────────────┐
  └── Task 3 (Frontend init) ───────┤
       ├── Task 4 (httputil) ───────┤
       └── Task 5 (FE shared) ─────┤
            ├── Task 6 (board) ─────┤ ← all 6 parallel
            ├── Task 7 (convo) ─────┤
            ├── Task 8 (agent) ─────┤
            ├── Task 9 (BoardPage) ─┤
            ├── Task 10 (CardDetail)┤
            └── Task 11 (ChatPanel)─┤
                 ├── Task 12 (Go server entry) ┐
                 └── Task 13 (FE App+routes) ──┤
                      └── Task 14 (verify all)
```

---

### Task 1: Project initialization

**Files:**
- Create: `agent-desk/.gitignore`
- Create: `agent-desk/package.json`
- Create: `agent-desk/CLAUDE.md`

This task must complete before any other task starts.

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/jackuait/Packages/agent-desk
git init
```

- [ ] **Step 2: Create .gitignore**

Create `agent-desk/.gitignore`:

```gitignore
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Go
backend/tmp/

# Playwright
frontend/test-results/
frontend/playwright-report/

# Yarn
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
.pnp.*
```

- [ ] **Step 3: Create root package.json**

Create `agent-desk/package.json`:

```json
{
  "name": "agent-desk",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev:frontend": "cd frontend && yarn dev",
    "dev:backend": "cd backend && go run ./cmd/server",
    "test:frontend": "cd frontend && yarn test",
    "test:backend": "cd backend && go test ./...",
    "test": "npm run test:frontend && npm run test:backend",
    "lint": "cd frontend && yarn lint"
  }
}
```

- [ ] **Step 4: Create CLAUDE.md**

Create `agent-desk/CLAUDE.md`:

```markdown
# Agent Desk

Kanban board where each card is a live conversation with an AI agent. Agents move cards through columns as they work. Users chat with agents directly inside cards.

## Architecture

- **Frontend:** React + TypeScript + Vite in `frontend/`
  - Flat feature-based architecture (colocation pattern)
  - Features: `board/`, `card/`, `chat/` — each self-contained with component + test + index
  - Shared: `types/`, `api/`, `ui/`, `test-utils/`
  - Styling: CSS Modules
  - Routing: React Router with lazy-loaded routes

- **Backend:** Go + stdlib `net/http` in `backend/`
  - Standard layout: `cmd/`, `internal/`, `pkg/`
  - Domains: `board/`, `conversation/`, `agent/`
  - Each domain has: handler, service interface, repository interface
  - No framework, no ORM

## TDD Rules

1. Write the failing test FIRST
2. Run it — confirm it FAILS
3. Write the minimal code to make it pass
4. Run it — confirm it PASSES
5. Refactor if needed, re-run tests
6. Commit

## Completion Checklist

Before considering any task done:
- [ ] All tests pass: `cd frontend && yarn test` and `cd backend && go test ./...`
- [ ] Frontend builds: `cd frontend && yarn build`
- [ ] Backend builds: `cd backend && go build ./...`
- [ ] Linting clean: `cd frontend && yarn lint`
- [ ] Changes committed with descriptive message

## Frontend Conventions

- Test files colocated: `Component.test.tsx` next to `Component.tsx`
- Use `renderWithRouter` from `shared/test-utils/render.tsx` for components that need routing
- Export features through `index.ts` barrel files
- CSS Modules for styling: `Component.module.css`
- Lazy load route-level components with `React.lazy`

## Backend Conventions

- Handlers accept `http.ResponseWriter` and `*http.Request`
- Use `pkg/httputil.JSON()` for JSON responses
- Repository and service are interfaces — no concrete implementations yet
- Tests use `httptest.NewRecorder()` and `httptest.NewRequest()`
- Domain types live in their own domain package

## Common Pitfalls

- DO NOT install a Go web framework — use stdlib `net/http`
- DO NOT add a database driver — interfaces only
- DO NOT implement AgentProvider — interface definition only
- DO NOT add authentication or sessions
- DO NOT modify tooling configs (vite, vitest, eslint, tsconfig, playwright) without explicit request
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add .gitignore package.json CLAUDE.md docs/
git commit -m "chore: initialize agent-desk project with root config and design spec"
```

---

### Task 2: Go backend initialization

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`

**Depends on:** Task 1

- [ ] **Step 1: Initialize Go module**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go mod init github.com/jackuait/agent-desk/backend
```

- [ ] **Step 2: Create minimal main.go**

Create `backend/cmd/server/main.go`:

```go
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		server.Close()
	}()

	log.Println("Server starting on :8080")
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go build ./cmd/server
```

Expected: no errors, binary created.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/
git commit -m "chore: initialize Go backend with health endpoint"
```

---

### Task 3: Frontend initialization

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/vite-env.d.ts`

**Depends on:** Task 1

- [ ] **Step 1: Scaffold with Vite**

```bash
cd /Users/jackuait/Packages/agent-desk
yarn dlx create-vite frontend --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn add react-router
yarn add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @playwright/test eslint @eslint/js typescript-eslint
```

- [ ] **Step 3: Configure vitest**

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

Create `frontend/src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Configure Playwright**

Create `frontend/playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: "yarn dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:5173",
  },
});
```

Create empty directory `frontend/tests/e2e/` with a `.gitkeep`:

```bash
mkdir -p /Users/jackuait/Packages/agent-desk/frontend/tests/e2e
touch /Users/jackuait/Packages/agent-desk/frontend/tests/e2e/.gitkeep
```

- [ ] **Step 5: Configure ESLint (flat config)**

Create `frontend/eslint.config.mjs`:

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  }
);
```

- [ ] **Step 6: Clean up Vite scaffold**

Remove the default Vite boilerplate files that we don't need:

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
rm -f src/App.css src/App.tsx src/index.css src/assets/react.svg public/vite.svg
```

Replace `frontend/src/main.tsx` with a minimal placeholder:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div>Agent Desk</div>
  </StrictMode>
);
```

Update `frontend/index.html` — replace the `<title>` content with `Agent Desk`.

- [ ] **Step 7: Update package.json scripts**

Add to `frontend/package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "lint": "eslint ."
}
```

- [ ] **Step 8: Verify everything works**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn build
yarn lint
```

Expected: build succeeds, lint passes (no source files to lint yet is OK).

- [ ] **Step 9: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/
git commit -m "chore: initialize React frontend with Vite, Vitest, Playwright, ESLint"
```

---

### Task 4: Backend pkg/httputil

**Files:**
- Create: `backend/pkg/httputil/respond.go`
- Create: `backend/pkg/httputil/respond_test.go`

**Depends on:** Task 2

- [ ] **Step 1: Write the failing test**

Create `backend/pkg/httputil/respond_test.go`:

```go
package httputil_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func TestJSON(t *testing.T) {
	t.Run("writes JSON response with correct status and headers", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		data := map[string]string{"message": "hello"}

		httputil.JSON(recorder, http.StatusOK, data)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, recorder.Code)
		}

		contentType := recorder.Header().Get("Content-Type")
		if contentType != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", contentType)
		}

		expected := `{"message":"hello"}` + "\n"
		if recorder.Body.String() != expected {
			t.Errorf("expected body %q, got %q", expected, recorder.Body.String())
		}
	})

	t.Run("writes error status codes", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		data := map[string]string{"error": "not found"}

		httputil.JSON(recorder, http.StatusNotFound, data)

		if recorder.Code != http.StatusNotFound {
			t.Errorf("expected status %d, got %d", http.StatusNotFound, recorder.Code)
		}
	})
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./pkg/httputil/...
```

Expected: FAIL — `httputil.JSON` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `backend/pkg/httputil/respond.go`:

```go
package httputil

import (
	"encoding/json"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./pkg/httputil/...
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/pkg/
git commit -m "feat(backend): add httputil JSON response helper"
```

---

### Task 5: Frontend shared types, test-utils, and API interface

**Files:**
- Create: `frontend/src/shared/types/domain.ts`
- Create: `frontend/src/shared/api/agent-provider.ts`
- Create: `frontend/src/shared/test-utils/render.tsx`
- Create: `frontend/src/shared/ui/.gitkeep`
- Create: `frontend/src/assets/.gitkeep`

**Depends on:** Task 3

- [ ] **Step 1: Create domain types**

Create `frontend/src/shared/types/domain.ts`:

```typescript
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

export interface Card {
  id: string;
  title: string;
  status: string;
  messages: Message[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

- [ ] **Step 2: Create AgentProvider interface**

Create `frontend/src/shared/api/agent-provider.ts`:

```typescript
import type { Message } from "../types/domain";

export interface AgentProvider {
  sendMessage(conversationId: string, content: string): Promise<Message>;
  streamResponse(
    conversationId: string,
    content: string
  ): AsyncIterable<string>;
}
```

- [ ] **Step 3: Create test render utility**

Create `frontend/src/shared/test-utils/render.tsx`:

```tsx
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";

export function renderWithRouter(
  ui: ReactElement,
  {
    initialEntries = ["/"],
    ...options
  }: RenderOptions & { initialEntries?: string[] } = {}
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    ),
    ...options,
  });
}
```

- [ ] **Step 4: Create placeholder directories**

```bash
mkdir -p /Users/jackuait/Packages/agent-desk/frontend/src/shared/ui
touch /Users/jackuait/Packages/agent-desk/frontend/src/shared/ui/.gitkeep
mkdir -p /Users/jackuait/Packages/agent-desk/frontend/src/assets
touch /Users/jackuait/Packages/agent-desk/frontend/src/assets/.gitkeep
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/src/shared/ frontend/src/assets/
git commit -m "feat(frontend): add shared types, AgentProvider interface, and test utils"
```

---

### Task 6: Backend board domain

**Files:**
- Create: `backend/internal/board/repository.go`
- Create: `backend/internal/board/service.go`
- Create: `backend/internal/board/handler.go`
- Create: `backend/internal/board/handler_test.go`

**Depends on:** Task 4

- [ ] **Step 1: Create domain types and repository interface**

Create `backend/internal/board/repository.go`:

```go
package board

import "context"

type Board struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Columns []Column `json:"columns"`
}

type Column struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	CardIDs []string `json:"cardIds"`
}

type Repository interface {
	Get(ctx context.Context, id string) (Board, error)
	List(ctx context.Context) ([]Board, error)
	Create(ctx context.Context, board Board) (Board, error)
	Update(ctx context.Context, board Board) (Board, error)
	Delete(ctx context.Context, id string) error
	GetColumn(ctx context.Context, boardID, columnID string) (Column, error)
	MoveCard(ctx context.Context, boardID, cardID, fromColumnID, toColumnID string) error
}
```

- [ ] **Step 2: Create service interface**

Create `backend/internal/board/service.go`:

```go
package board

import "context"

type Service interface {
	GetBoard(ctx context.Context, id string) (Board, error)
	ListBoards(ctx context.Context) ([]Board, error)
	CreateBoard(ctx context.Context, title string) (Board, error)
	UpdateBoard(ctx context.Context, board Board) (Board, error)
	DeleteBoard(ctx context.Context, id string) error
	MoveCard(ctx context.Context, boardID, cardID, fromColumnID, toColumnID string) error
}
```

- [ ] **Step 3: Write the failing handler tests**

Create `backend/internal/board/handler_test.go`:

```go
package board_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/board"
)

func TestHandleListBoards(t *testing.T) {
	handler := board.HandleListBoards()
	req := httptest.NewRequest(http.MethodGet, "/api/boards", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}

func TestHandleGetBoard(t *testing.T) {
	handler := board.HandleGetBoard()
	req := httptest.NewRequest(http.MethodGet, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}

func TestHandleCreateBoard(t *testing.T) {
	handler := board.HandleCreateBoard()
	req := httptest.NewRequest(http.MethodPost, "/api/boards", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
}

func TestHandleUpdateBoard(t *testing.T) {
	handler := board.HandleUpdateBoard()
	req := httptest.NewRequest(http.MethodPut, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
}

func TestHandleDeleteBoard(t *testing.T) {
	handler := board.HandleDeleteBoard()
	req := httptest.NewRequest(http.MethodDelete, "/api/boards/board-1", nil)
	req.SetPathValue("id", "board-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/board/...
```

Expected: FAIL — `HandleListBoards`, `HandleGetBoard`, etc. not defined.

- [ ] **Step 5: Write minimal handler implementation**

Create `backend/internal/board/handler.go`:

```go
package board

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func HandleListBoards() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, []Board{})
	})
}

func HandleGetBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Placeholder"})
	})
}

func HandleCreateBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, Board{ID: "new", Title: "New Board"})
	})
}

func HandleUpdateBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Board{ID: id, Title: "Updated"})
	})
}

func HandleDeleteBoard() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/boards", HandleListBoards())
	mux.Handle("GET /api/boards/{id}", HandleGetBoard())
	mux.Handle("POST /api/boards", HandleCreateBoard())
	mux.Handle("PUT /api/boards/{id}", HandleUpdateBoard())
	mux.Handle("DELETE /api/boards/{id}", HandleDeleteBoard())
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/board/...
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/internal/board/
git commit -m "feat(backend): add board domain with interfaces and placeholder handlers"
```

---

### Task 7: Backend conversation domain

**Files:**
- Create: `backend/internal/conversation/repository.go`
- Create: `backend/internal/conversation/service.go`
- Create: `backend/internal/conversation/handler.go`
- Create: `backend/internal/conversation/handler_test.go`

**Depends on:** Task 4

- [ ] **Step 1: Create domain types and repository interface**

Create `backend/internal/conversation/repository.go`:

```go
package conversation

import "context"

type Conversation struct {
	ID       string    `json:"id"`
	CardID   string    `json:"cardId"`
	Messages []Message `json:"messages"`
}

type Message struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type Repository interface {
	Get(ctx context.Context, id string) (Conversation, error)
	List(ctx context.Context) ([]Conversation, error)
	Create(ctx context.Context, conv Conversation) (Conversation, error)
	AddMessage(ctx context.Context, conversationID string, msg Message) (Message, error)
}
```

- [ ] **Step 2: Create service interface**

Create `backend/internal/conversation/service.go`:

```go
package conversation

import "context"

type Service interface {
	GetConversation(ctx context.Context, id string) (Conversation, error)
	ListConversations(ctx context.Context) ([]Conversation, error)
	CreateConversation(ctx context.Context, cardID string) (Conversation, error)
	SendMessage(ctx context.Context, conversationID, content string) (Message, error)
}
```

- [ ] **Step 3: Write the failing handler tests**

Create `backend/internal/conversation/handler_test.go`:

```go
package conversation_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/conversation"
)

func TestHandleGetConversation(t *testing.T) {
	handler := conversation.HandleGetConversation()
	req := httptest.NewRequest(http.MethodGet, "/api/conversations/conv-1", nil)
	req.SetPathValue("id", "conv-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}

func TestHandleCreateConversation(t *testing.T) {
	handler := conversation.HandleCreateConversation()
	req := httptest.NewRequest(http.MethodPost, "/api/conversations", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}
}

func TestHandleAddMessage(t *testing.T) {
	handler := conversation.HandleAddMessage()
	req := httptest.NewRequest(http.MethodPost, "/api/conversations/conv-1/messages", nil)
	req.SetPathValue("id", "conv-1")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/conversation/...
```

Expected: FAIL — handler functions not defined.

- [ ] **Step 5: Write minimal handler implementation**

Create `backend/internal/conversation/handler.go`:

```go
package conversation

import (
	"net/http"

	"github.com/jackuait/agent-desk/backend/pkg/httputil"
)

func HandleGetConversation() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		httputil.JSON(w, http.StatusOK, Conversation{ID: id, Messages: []Message{}})
	})
}

func HandleCreateConversation() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, Conversation{ID: "new", Messages: []Message{}})
	})
}

func HandleAddMessage() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusCreated, Message{ID: "msg-1", Role: "user", Content: ""})
	})
}

func RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/conversations/{id}", HandleGetConversation())
	mux.Handle("POST /api/conversations", HandleCreateConversation())
	mux.Handle("POST /api/conversations/{id}/messages", HandleAddMessage())
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/conversation/...
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/internal/conversation/
git commit -m "feat(backend): add conversation domain with interfaces and placeholder handlers"
```

---

### Task 8: Backend agent domain

**Files:**
- Create: `backend/internal/agent/provider.go`
- Create: `backend/internal/agent/provider_test.go`

**Depends on:** Task 2

- [ ] **Step 1: Write the failing test**

Create `backend/internal/agent/provider_test.go`:

```go
package agent_test

import (
	"context"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

// Compile-time check that the interface is implementable.
type mockProvider struct{}

func (m *mockProvider) SendMessage(_ context.Context, _ string, _ string) (agent.Message, error) {
	return agent.Message{}, nil
}

func (m *mockProvider) StreamResponse(_ context.Context, _ string, _ string) (<-chan string, error) {
	return nil, nil
}

var _ agent.Provider = (*mockProvider)(nil)

func TestProviderInterfaceIsImplementable(t *testing.T) {
	var p agent.Provider = &mockProvider{}
	if p == nil {
		t.Error("expected non-nil provider")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/agent/...
```

Expected: FAIL — `agent.Provider` and `agent.Message` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `backend/internal/agent/provider.go`:

```go
package agent

import "context"

type Message struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
}

type Provider interface {
	SendMessage(ctx context.Context, conversationID string, content string) (Message, error)
	StreamResponse(ctx context.Context, conversationID string, content string) (<-chan string, error)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./internal/agent/...
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/internal/agent/
git commit -m "feat(backend): add agent provider interface"
```

---

### Task 9: Frontend BoardPage feature

**Files:**
- Create: `frontend/src/features/board/BoardPage.tsx`
- Create: `frontend/src/features/board/BoardPage.test.tsx`
- Create: `frontend/src/features/board/index.ts`

**Depends on:** Task 5

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/board/BoardPage.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { BoardPage } from "./BoardPage";

describe("BoardPage", () => {
  it("renders the heading", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });

  it("renders the board container", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByTestId("board-container")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/board/BoardPage.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/board/BoardPage.tsx`:

```tsx
export function BoardPage() {
  return (
    <div>
      <h1>Agent Desk</h1>
      <div data-testid="board-container"></div>
    </div>
  );
}
```

Create `frontend/src/features/board/index.ts`:

```typescript
export { BoardPage } from "./BoardPage";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/board/BoardPage.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/src/features/board/
git commit -m "feat(frontend): add BoardPage placeholder component"
```

---

### Task 10: Frontend CardDetail feature

**Files:**
- Create: `frontend/src/features/card/CardDetail.tsx`
- Create: `frontend/src/features/card/CardDetail.test.tsx`
- Create: `frontend/src/features/card/index.ts`

**Depends on:** Task 5

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/card/CardDetail.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { CardDetail } from "./CardDetail";
import { Route, Routes } from "react-router";

function renderCardDetail(id: string) {
  renderWithRouter(
    <Routes>
      <Route path="/card/:id" element={<CardDetail />} />
    </Routes>,
    { initialEntries: [`/card/${id}`] }
  );
}

describe("CardDetail", () => {
  it("displays the card id from route params", () => {
    renderCardDetail("card-42");
    expect(screen.getByText(/card-42/)).toBeInTheDocument();
  });

  it("renders the card detail container", () => {
    renderCardDetail("card-1");
    expect(screen.getByTestId("card-detail")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/card/CardDetail.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/card/CardDetail.tsx`:

```tsx
import { useParams } from "react-router";

export function CardDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div data-testid="card-detail">
      <h2>Card: {id}</h2>
    </div>
  );
}
```

Create `frontend/src/features/card/index.ts`:

```typescript
export { CardDetail } from "./CardDetail";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/card/CardDetail.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/src/features/card/
git commit -m "feat(frontend): add CardDetail placeholder component"
```

---

### Task 11: Frontend ChatPanel feature

**Files:**
- Create: `frontend/src/features/chat/ChatPanel.tsx`
- Create: `frontend/src/features/chat/ChatPanel.test.tsx`
- Create: `frontend/src/features/chat/index.ts`

**Depends on:** Task 5

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/chat/ChatPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";

describe("ChatPanel", () => {
  it("renders the message list", () => {
    render(<ChatPanel />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    render(<ChatPanel />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/chat/ChatPanel.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/features/chat/ChatPanel.tsx`:

```tsx
export function ChatPanel() {
  return (
    <div data-testid="chat-panel">
      <div data-testid="message-list"></div>
      <input type="text" placeholder="Type a message..." />
    </div>
  );
}
```

Create `frontend/src/features/chat/index.ts`:

```typescript
export { ChatPanel } from "./ChatPanel";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/features/chat/ChatPanel.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/src/features/chat/
git commit -m "feat(frontend): add ChatPanel placeholder component"
```

---

### Task 12: Backend server entry point

**Files:**
- Modify: `backend/cmd/server/main.go`

**Depends on:** Tasks 6, 7, 8

- [ ] **Step 1: Update main.go to register all domain routes**

Replace `backend/cmd/server/main.go` with:

```go
package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackuait/agent-desk/backend/internal/board"
	"github.com/jackuait/agent-desk/backend/internal/conversation"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok\n"))
	})

	board.RegisterRoutes(mux)
	conversation.RegisterRoutes(mux)

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		server.Close()
	}()

	log.Println("Server starting on :8080")
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go build ./cmd/server
```

Expected: no errors.

- [ ] **Step 3: Run all backend tests**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./...
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add backend/cmd/server/main.go
git commit -m "feat(backend): wire all domain routes into server entry point"
```

---

### Task 13: Frontend App and routes

**Files:**
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/App.test.tsx`
- Create: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/main.tsx`

**Depends on:** Tasks 9, 10, 11

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/App.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/app/App.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create routes.tsx**

Create `frontend/src/app/routes.tsx`:

```tsx
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const BoardPage = lazy(() =>
  import("../features/board").then((m) => ({ default: m.BoardPage }))
);
const CardDetail = lazy(() =>
  import("../features/card").then((m) => ({ default: m.CardDetail }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/card/:id" element={<CardDetail />} />
      </Routes>
    </Suspense>
  );
}
```

- [ ] **Step 4: Create App.tsx**

Create `frontend/src/app/App.tsx`:

```tsx
import { BrowserRouter } from "react-router";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test -- src/app/App.test.tsx
```

Expected: PASS

- [ ] **Step 6: Update main.tsx**

Replace `frontend/src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jackuait/Packages/agent-desk
git add frontend/src/app/ frontend/src/main.tsx
git commit -m "feat(frontend): add App with lazy-loaded routes"
```

---

### Task 14: Final verification

**Depends on:** Tasks 12, 13

- [ ] **Step 1: Run all frontend tests**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn test
```

Expected: all PASS.

- [ ] **Step 2: Run all backend tests**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go test ./...
```

Expected: all PASS.

- [ ] **Step 3: Build frontend**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn build
```

Expected: build succeeds.

- [ ] **Step 4: Build backend**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go build ./cmd/server
```

Expected: build succeeds.

- [ ] **Step 5: Lint frontend**

```bash
cd /Users/jackuait/Packages/agent-desk/frontend
yarn lint
```

Expected: no errors.

- [ ] **Step 6: Verify Go vet**

```bash
cd /Users/jackuait/Packages/agent-desk/backend
go vet ./...
```

Expected: no issues.
