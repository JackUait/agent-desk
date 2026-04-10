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
