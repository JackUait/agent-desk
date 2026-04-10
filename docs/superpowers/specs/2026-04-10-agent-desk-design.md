# Agent Desk — Design Spec

## Overview

Agent Desk is a kanban board where each card represents a live conversation with an AI agent. Agents move cards through columns as they work, and users can chat with agents directly inside each card. The frontend is a React SPA; the backend is a Go HTTP server that will handle board state, conversation persistence, and Claude API integration.

This spec covers the **skeleton only** — project scaffolding, folder structure, tooling config, placeholder components with tests, and interface definitions. No real business logic, no database implementation, no Claude API calls.

## Tech Stack

### Frontend
- **Runtime:** Node.js (latest stable)
- **Package manager:** Yarn 4.x (enforced via `packageManager` field)
- **Language:** TypeScript (latest stable, strict mode)
- **Framework:** React (latest stable)
- **Bundler:** Vite (latest stable)
- **Routing:** React Router (latest stable)
- **Styling:** CSS Modules
- **Unit testing:** Vitest + React Testing Library
- **E2E testing:** Playwright (config only, no tests in skeleton)
- **Linting:** ESLint with flat config, typescript-eslint

### Backend
- **Language:** Go (latest stable)
- **HTTP:** Go standard library `net/http`
- **Testing:** Go built-in `testing` package
- **No framework, no ORM** — interfaces only for persistence

## Architecture

### Frontend — Flat feature-based (colocation)

Each feature is a self-contained folder with its own components, hooks, types, and tests colocated. This pattern was chosen for agent-friendliness: AI agents navigate and modify code most reliably when related files are grouped together with no implicit import-direction rules.

### Backend — Domain-oriented with standard Go layout

Standard Go project structure (`cmd/`, `internal/`, `pkg/`) organized by domain (`board/`, `conversation/`, `agent/`). Each domain defines its own repository and service interfaces with no implementation.

## Folder Structure

```
agent-desk/
├── package.json                        # Root — scripts for dev convenience
├── CLAUDE.md                           # AI assistant guidance
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-10-agent-desk-design.md
│
├── backend/
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                 # Entry point, wires routes
│   ├── internal/
│   │   ├── board/
│   │   │   ├── handler.go              # HTTP handlers (placeholder responses)
│   │   │   ├── handler_test.go         # Tests for handlers
│   │   │   ├── service.go             # Business logic interface
│   │   │   └── repository.go          # Storage interface
│   │   ├── conversation/
│   │   │   ├── handler.go
│   │   │   ├── handler_test.go
│   │   │   ├── service.go
│   │   │   └── repository.go
│   │   └── agent/
│   │       ├── provider.go            # Claude API adapter interface
│   │       └── provider_test.go
│   └── pkg/
│       └── httputil/
│           └── respond.go             # Shared JSON response helper
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   ├── eslint.config.mjs
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── app/
│   │   │   ├── App.tsx                 # Root component, router setup
│   │   │   ├── App.test.tsx
│   │   │   └── routes.tsx              # Route definitions (lazy-loaded)
│   │   ├── features/
│   │   │   ├── board/
│   │   │   │   ├── BoardPage.tsx       # Board page placeholder
│   │   │   │   ├── BoardPage.test.tsx
│   │   │   │   └── index.ts
│   │   │   ├── card/
│   │   │   │   ├── CardDetail.tsx      # Card detail placeholder
│   │   │   │   ├── CardDetail.test.tsx
│   │   │   │   └── index.ts
│   │   │   └── chat/
│   │   │       ├── ChatPanel.tsx       # Chat interface placeholder
│   │   │       ├── ChatPanel.test.tsx
│   │   │       └── index.ts
│   │   ├── shared/
│   │   │   ├── ui/                     # Reusable UI primitives (empty)
│   │   │   ├── api/
│   │   │   │   └── agent-provider.ts   # AgentProvider interface definition
│   │   │   ├── types/
│   │   │   │   └── domain.ts           # Board, Column, Card, Message types
│   │   │   └── test-utils/
│   │   │       └── render.tsx          # Custom render with router context
│   │   └── assets/
│   └── tests/
│       └── e2e/                        # Playwright tests (empty directory)
```

## Frontend Components

### App.tsx
- Wraps the router provider
- Renders route outlet
- Test: verifies it renders without crashing

### routes.tsx
- `/` → `BoardPage` (lazy-loaded)
- `/card/:id` → `CardDetail` (lazy-loaded)

### BoardPage.tsx
- Renders heading "Agent Desk" and an empty board container
- Test: verifies heading renders

### CardDetail.tsx
- Renders a card placeholder displaying the route param `id`
- Test: verifies route param is displayed

### ChatPanel.tsx
- Renders a message list placeholder and an input area
- Not routed directly — designed to be embedded inside CardDetail
- Test: verifies message list and input area are present

## Frontend Shared Types

```typescript
interface Board {
  id: string;
  title: string;
  columns: Column[];
}

interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

interface Card {
  id: string;
  title: string;
  status: string;
  messages: Message[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
```

## Frontend AgentProvider Interface

```typescript
interface AgentProvider {
  sendMessage(conversationId: string, content: string): Promise<Message>;
  streamResponse(conversationId: string, content: string): AsyncIterable<string>;
}
```

No implementation in skeleton — just the type definition.

## Backend Domains

### board
- **repository.go** — `BoardRepository` interface: `Get`, `List`, `Create`, `Update`, `Delete` for boards; `GetColumn`, `MoveCard` for column operations
- **service.go** — `BoardService` interface wrapping repository with business logic method signatures
- **handler.go** — HTTP handlers for `GET /api/boards`, `GET /api/boards/{id}`, `POST /api/boards`, `PUT /api/boards/{id}`, `DELETE /api/boards/{id}`. All return placeholder JSON responses.
- **handler_test.go** — Tests verify correct status codes and response structure

### conversation
- **repository.go** — `ConversationRepository` interface: `Get`, `List`, `Create`, `AddMessage` for conversations
- **service.go** — `ConversationService` interface wrapping repository with business logic method signatures
- **handler.go** — HTTP handlers for `GET /api/conversations/{id}`, `POST /api/conversations`, `POST /api/conversations/{id}/messages`. Placeholder responses.
- **handler_test.go** — Tests verify correct status codes and response structure

### agent
- **provider.go** — `AgentProvider` interface: `SendMessage(ctx, conversationID, content) (Message, error)`, `StreamResponse(ctx, conversationID, content) (<-chan string, error)`. Mirrors the frontend interface.
- **provider_test.go** — Tests verify the interface contract compiles correctly

### pkg/httputil
- **respond.go** — `JSON(w, status, data)` helper for writing JSON responses with correct headers

## Backend Entry Point (cmd/server/main.go)

- Creates an `http.ServeMux`
- Registers all domain handlers
- Starts server on `:8080`
- Graceful shutdown on SIGINT/SIGTERM

## CLAUDE.md

Will include:
- Project description and architecture overview
- TDD rules (write tests first, watch them fail, then implement)
- Completion checklist (tests pass, build succeeds, linting clean)
- Frontend conventions (feature-based colocation, CSS Modules, lazy routing)
- Backend conventions (domain-oriented, interfaces-first, stdlib HTTP)
- Common pitfalls and anti-patterns

## Testing Strategy

### Frontend
- **Unit tests** with Vitest + React Testing Library
- Colocated `*.test.tsx` files next to components
- Custom render helper wrapping components in router context
- All skeleton components have at least one test verifying they render

### Backend
- **Unit tests** with Go `testing` package
- Handler tests use `httptest.NewRecorder` and `httptest.NewRequest`
- All handlers tested for status codes and response structure

### E2E
- Playwright config present but no tests in skeleton
- `tests/e2e/` directory ready for future tests

## What Is NOT In Scope

- No real database or persistence implementation
- No Claude API integration (just interfaces)
- No authentication or sessions
- No drag-and-drop functionality
- No WebSocket/SSE for streaming
- No CI/CD configuration
- No Docker setup
