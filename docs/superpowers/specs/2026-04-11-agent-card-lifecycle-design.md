# Agent Card Lifecycle — Design Spec

Full vertical slice: users create kanban cards, chat with Claude Code agents, agents work autonomously in git worktrees, deliver PRs for review, and merge on approval.

## Card Lifecycle

A card progresses through 4 columns. Each column maps to a concrete system state:

| Column | What's Happening | Claude Code Process | Worktree |
|--------|-----------------|-------------------|----------|
| **Backlog** | User chats with agent, agent fills card details | Running (interactive chat) | None |
| **In Progress** | Agent codes autonomously in isolated worktree | Running (autonomous work) | Created |
| **Review** | Agent finished, user reviews. Can reject → In Progress | Paused (waiting) | Exists |
| **Done** | PR merged, cleanup complete | Terminated | Deleted |

### State Transitions

```
Backlog → In Progress     (user clicks "Start Development")
In Progress → Review      (agent signals READY_FOR_REVIEW)
Review → In Progress      (user sends rejection message in chat)
Review → Review           (user clicks "Approve" → PR created)
Review → Done             (user clicks "Merge" → PR merged, worktree cleaned)
```

No other transitions are valid.

## Architecture

### Agent Execution: CLI Process Spawner

Each card owns one Claude Code CLI process. The Go backend spawns `claude` as a child process and communicates via stdin/stdout JSON streaming.

- **First spawn**: `claude -p --output-format stream-json` with project dir as cwd. Capture session ID from the output.
- **Resume after restart**: `claude -p --output-format stream-json --resume <sessionId>` to continue an existing session.
- **Input**: User messages written to process stdin
- **Output**: stdout parsed as stream-json, forwarded to frontend via WebSocket
- **Isolation**: Each agent is its own OS process — crashes don't cascade
- **Capabilities**: Full Claude Code — all tools, skills, hooks, MCP servers work out of the box

### Communication: WebSocket per Card

Browser opens a WebSocket when the card modal opens. Go backend pipes messages bidirectionally between WebSocket and Claude Code process.

```
Browser ←— WebSocket —→ Go Backend ←— stdin/stdout —→ claude CLI
```

### Backend Components

```
backend/
├── cmd/server/main.go              ← Entry point, route registration
├── internal/
│   ├── board/                      ← Board state (single board, 4 fixed columns)
│   │   ├── handler.go
│   │   ├── service.go
│   │   └── repository.go
│   ├── card/                       ← Card CRUD + lifecycle state machine
│   │   ├── card.go                 ← Domain type
│   │   ├── handler.go
│   │   ├── service.go
│   │   └── repository.go
│   ├── agent/                      ← Claude Code process manager
│   │   ├── process.go              ← Spawn, pipe, kill
│   │   └── parser.go               ← Parse stream-json output
│   ├── worktree/                   ← Git worktree lifecycle
│   │   └── service.go              ← Create, remove, branch management
│   └── websocket/                  ← WebSocket hub
│       ├── hub.go                  ← Connection registry per card
│       └── handler.go              ← Upgrade + message routing
├── pkg/
│   ├── httputil/                   ← JSON response helpers (exists)
│   └── claude/                     ← Claude CLI wrapper (command builder)
```

### Frontend Components

```
frontend/src/
├── features/
│   ├── board/                      ← BoardPage, Column, KanbanCard (extend)
│   ├── card/                       ← CardModal: left panel (card content)
│   │   ├── CardModal.tsx
│   │   ├── CardModal.module.css
│   │   ├── CardContent.tsx         ← Left panel: fields, buttons
│   │   └── CardModal.test.tsx
│   └── chat/                       ← ChatPanel: right panel (WebSocket chat)
│       ├── ChatPanel.tsx
│       ├── ChatPanel.module.css
│       ├── ChatMessage.tsx
│       └── ChatPanel.test.tsx
├── shared/
│   ├── api/
│   │   ├── client.ts               ← REST HTTP client
│   │   └── useCardSocket.ts        ← WebSocket hook per card
│   └── types/
│       └── domain.ts               ← Extended types
```

## Card Modal Layout

Split modal: card content on the left, live chat on the right.

### Left Panel — Card Content

Agent-populated fields:
- **Status badge** (column name)
- **Title** (refined during chat)
- **Description** (summary of the task)
- **Acceptance criteria** (extracted from conversation)
- **Complexity** (agent's estimate)
- **Relevant files** (agent's analysis)
- **Worktree path** (shown after Start, blank before)
- **PR link** (shown after Approve, blank before)

### Right Panel — Chat

Persistent chat window. Same Claude Code session across all card stages. Message input always active (except in Done — read-only).

### Action Buttons (bottom of left panel, context-sensitive)

| Column | Button |
|--------|--------|
| Backlog | "Start Development" |
| In Progress | (none — agent is working) |
| Review | "Approve" → then "Merge" + PR link after approval |
| Done | (none — read-only) |

## WebSocket Protocol

All messages are JSON with a `type` field.

### Client → Server

```json
{ "type": "message", "content": "Add a search bar" }
{ "type": "start" }
{ "type": "approve" }
{ "type": "merge" }
```

### Server → Client

```json
{ "type": "token", "content": "I'll" }
{ "type": "message", "role": "assistant", "content": "...", "id": "...", "timestamp": 0 }
{ "type": "card_update", "fields": { "title": "...", "description": "..." } }
{ "type": "status", "column": "in_progress" }
{ "type": "worktree", "path": "/tmp/agent-desk-worktrees/card-abc" }
{ "type": "pr", "url": "https://github.com/..." }
{ "type": "error", "message": "..." }
```

## Process Lifecycle

1. **Card created** → `claude -p --output-format stream-json` spawned, session ID captured from output
2. **User sends message** → piped to stdin, streamed response back via WebSocket
3. **User clicks Start** → message sent to Claude: create worktree, begin implementation
4. **Agent done** → emits READY_FOR_REVIEW signal, backend moves card to Review
5. **User rejects** → message piped to process, card back to In Progress, agent resumes
6. **User approves** → agent runs `gh pr create`, PR URL stored on card
7. **User clicks Merge** → backend runs `gh pr merge`, cleans up worktree, terminates process

### System Prompt

Each Claude Code process receives a system prompt instructing it:
- You are an agent working on a kanban card
- During Backlog: help user define the task, emit structured JSON to update card fields
- On Start: create a git worktree at `../agent-desk-worktrees/<card-id>`, begin TDD implementation
- When done: signal READY_FOR_REVIEW
- During Review rejection: address feedback, signal READY_FOR_REVIEW again when done
- On Approve: run `gh pr create` and return the PR URL

## Worktree & Git Flow

### Directory Structure

```
~/Packages/
├── agent-desk/                     ← main repo (user + app server)
└── agent-desk-worktrees/           ← sibling directory
    ├── card-a1b2c3/               ← worktree for card a1b2
    └── card-d4e5f6/               ← worktree for card d4e5
```

Worktrees live as siblings to avoid triggering Vite's file watcher, `git status`, and IDE indexing in the main repo.

### Worktree Lifecycle

1. **Start**: `git worktree add ../agent-desk-worktrees/<card-id> -b agent/<card-id>`
2. **Work**: Agent commits to `agent/<card-id>` branch inside worktree
3. **PR**: `gh pr create --base master --head agent/<card-id>`
4. **Merge**: `gh pr merge <url> --merge`
5. **Cleanup**: `git worktree remove ../agent-desk-worktrees/<card-id>` + `git branch -d agent/<card-id>`

## API Surface

### REST Endpoints

```
POST   /api/cards              → Create card (returns card with ID)
GET    /api/cards              → List all cards
GET    /api/cards/{id}         → Get card details
DELETE /api/cards/{id}         → Delete card + kill process + cleanup
PATCH  /api/cards/{id}         → Update card fields
POST   /api/cards/{id}/merge   → Merge PR + cleanup worktree
GET    /api/board              → Get board state (columns + card IDs)
```

### WebSocket

```
WS     /api/cards/{id}/ws     → Bidirectional chat + events for a card
```

WebSocket connects when card modal opens, disconnects on close. Claude Code process keeps running regardless. Reconnecting gets current state.

### Frontend API Layer

```typescript
// shared/api/client.ts
const api = {
  createCard(): Promise<Card>
  listCards(): Promise<Card[]>
  getCard(id: string): Promise<Card>
  deleteCard(id: string): Promise<void>
  mergeCard(id: string): Promise<void>
  getBoard(): Promise<Board>
}

// shared/api/useCardSocket.ts
function useCardSocket(cardId: string): {
  messages: Message[]
  sendMessage(content: string): void
  sendAction(type: 'start' | 'approve' | 'merge'): void
  cardUpdates: Partial<Card>
  status: 'connecting' | 'connected' | 'disconnected'
}
```

## Data Persistence

For the vertical slice: in-memory storage.

- `map[string]*Card` — card state (fields, column, session ID, PR URL)
- `map[string]*exec.Cmd` — running Claude Code processes
- Message history managed by Claude Code's session system (resume with `--resume`)

No database. Cards survive as long as the server runs.

## Testing Strategy

### Backend Tests

| Component | Approach | What's Tested |
|-----------|----------|---------------|
| Card service | Unit, mock repo | CRUD, state machine transitions |
| WebSocket hub | httptest + ws client | Connection lifecycle, message routing |
| Process manager | Unit, mock exec.Cmd | Spawn, pipe, session resume, cleanup |
| Worktree service | Integration, temp git repo | Create/remove worktree, branch isolation |
| PR service | Unit, mock gh command | Command assembly, error handling |
| Handlers | httptest recorder | Status codes, response bodies |

### Frontend Tests

| Component | Approach | What's Tested |
|-----------|----------|---------------|
| ChatPanel | Vitest + Testing Library, mock WS | Message rendering, input, streaming tokens |
| CardModal | Vitest + Testing Library | Layout, field display, button visibility per state |
| useCardSocket | Vitest hook testing | Connect, reconnect, message parsing, cleanup |
| useCard | Vitest hook testing | Card state from WebSocket events |
| Board | Extend existing tests | Card creation, column transitions |

### Integration (Playwright)

One end-to-end test for the vertical slice:
1. Open board → Create card → Modal opens
2. Type message → See agent response
3. Click Start → Card moves to In Progress
4. (Mock agent) → Card moves to Review
5. Approve → PR link appears
6. Merge → Card moves to Done

Claude Code process mocked in integration tests with a canned-response echo server.

## Replaced Existing Code

The current stubbed endpoints get replaced:
- `/api/boards/*` → simplified to `GET /api/board` (single board, 4 fixed columns)
- `/api/conversations/*` → absorbed into WebSocket (messages managed by Claude Code sessions)
- Board/Conversation service and repository interfaces → replaced by Card and Board services
