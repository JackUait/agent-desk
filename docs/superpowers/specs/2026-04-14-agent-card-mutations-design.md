# Agent Card Mutations via MCP

**Date:** 2026-04-14
**Status:** Approved — ready for implementation plan
**Related:** `2026-04-11-agent-card-lifecycle-design.md`, `2026-04-10-agent-desk-design.md`

## Problem

Cards in Agent Desk are populated once at creation and then sit read-only while the agent works. The screenshot today shows a freshly-opened card with just `Backlog / blok / New Card` — the agent has no way to push title, description, status, or progress updates back to the board. Users cannot tell whether the agent is thinking, stuck, or done without reading the full chat transcript.

This spec defines how a nested Claude Code CLI agent mutates its own card's state live, and which new fields make the card useful as an agent status surface.

## Goals

- Agent can update: title, description, status (column), summary, progress, labels, blocked reason, acceptance criteria, relevant files, complexity.
- Mutations appear live in the board and card modal without page refresh.
- Illegal state transitions (e.g., `backlog → done`) are rejected before mutation, with the agent self-correcting via tool-result errors.
- Architecture survives agent runtime swaps (Claude CLI → direct SDK → remote agents) with zero rewrite of the mutation layer.
- Agent cannot mutate the wrong card under any circumstance.

## Non-goals

- Agent creating, deleting, or spawning other cards.
- Drag-drop UI changes, label filtering UI, new board columns.
- Activity log / audit stream.
- Priority, test status, commit SHAs (deferred — YAGNI).
- Multi-card agent operations.

## Architecture

```
┌─────────────┐   spawn + --mcp-config      ┌──────────────────┐
│ Claude CLI  │ ◄──────────────────────────►│  backend (Go)    │
│ (subprocess)│                              │                  │
│             │   stream-json (tool_use)    │  ┌────────────┐  │
│             │ ────────────────────────────►│  │ card.Service│  │
│             │                              │  └─────▲──────┘  │
│             │   HTTP MCP (streamable)     │        │         │
│             │ ◄──────────────────────────►│  ┌─────┴──────┐  │
│             │    session-scoped /mcp      │  │ mcp.Server │  │
└─────────────┘    ?token=<token>           │  └────────────┘  │
                                             │  ┌────────────┐  │
                                             │  │ws.Handler  │──┼──► FE
                                             │  └────────────┘  │
                                             └──────────────────┘
```

- Backend gains an `internal/mcp/` package exposing an HTTP MCP endpoint on the same listener as REST + WebSocket.
- When `agent.Manager.Send` spawns a Claude CLI subprocess, it mints a short-lived **session token** mapped to a single `cardId`, writes a temporary `.mcp.json` config pointing at `http://127.0.0.1:<port>/mcp?token=<token>`, and passes `--mcp-config <path>` plus `--allowed-tools "mcp__agent_desk__*"` to the CLI.
- The MCP server resolves `token → cardId` on every request. Tool handlers call `card.Service` in-process — no extra HTTP hop, no IPC.
- `card.Service` already calls `broadcastCard` on every mutation, so frontend state updates flow through the existing WebSocket `card_update` message with zero new plumbing.
- Tool-use blocks emitted by the agent already stream end-to-end via the stream-json parser → WebSocket. The frontend gains a semantic label layer for `mcp__agent_desk__*` tool names.

### Why MCP over Bash+curl

Criteria were **bulletproof** and **future-proof**:

- **Schema validation at the protocol layer** — agent literally cannot send a malformed `column` value, wrong type, or unknown field. No 400 retry loops.
- **Structured errors** — MCP returns `CallToolResult { isError: true }` with a message; the Claude CLI feeds this back into the agent's next turn, and the agent self-corrects in-loop.
- **Single code path** — one place to audit, log, rate-limit every mutation. Bash path would sprinkle `curl` calls across the system prompt with no central choke point.
- **Runtime-agnostic** — MCP is Anthropic's standard agent ↔ backend protocol. Swap the agent runtime later (direct Anthropic SDK, Codex, Cursor, remote Claude) and every MCP client speaks the same tool surface. Bash+curl locks us into "any future runtime must expose a shell".
- **Transport flexible** — stdio or HTTP today, SSE or remote HTTP tomorrow, same tool definitions.
- **Permission model** — CLI `--allowed-tools` narrows the agent to `mcp__agent_desk__*`; it cannot run arbitrary shell.
- **Semantic tool-use events** — the existing WS stream carries `tool_use` blocks with `name: "mcp__agent_desk__set_status"`, which the frontend renders as typed chips forever. Bash would force argv parsing that breaks whenever flags change.

Bash+curl was attractive because it was zero-LOC on top of the existing PATCH endpoint, but that optimizes for lines written, not for the stated criteria. MCP is the correct answer under bulletproof + future-proof.

## Data model

### New fields on `Card`

```go
// backend/internal/card/card.go
type Card struct {
    // ... existing fields ...
    Labels        []string  `json:"labels"`
    Summary       string    `json:"summary"`
    BlockedReason string    `json:"blockedReason"`
    Progress      *Progress `json:"progress,omitempty"`
    UpdatedAt     int64     `json:"updatedAt"`
}

type Progress struct {
    Step        int    `json:"step"`
    TotalSteps  int    `json:"totalSteps"`
    CurrentStep string `json:"currentStep"`
}
```

Frontend type mirrors this in `frontend/src/shared/types/domain.ts`, with `progress` as nullable.

### Invariants

- `UpdatedAt` is stamped by `card.Service` on every mutation path. Agents cannot set it directly.
- `Progress.Step` ≤ `Progress.TotalSteps`; `TotalSteps` ≥ 1 when `Progress` is non-nil.
- `Labels` are trimmed and deduped on set; empty strings are rejected.
- `BlockedReason == ""` means the card is not blocked. Non-empty renders a banner.
- `Summary` is capped at 280 characters.
- All validation lives in `card.Service`, not in the MCP layer — the MCP layer only enforces JSON-schema shape.

### Service methods

New methods, each stamping `UpdatedAt`:

- `SetSummary(id, summary)`
- `SetProgress(id, step, totalSteps, currentStep)`
- `ClearProgress(id)`
- `SetBlocked(id, reason)`
- `ClearBlocked(id)`
- `AddLabel(id, label)`
- `RemoveLabel(id, label)`
- `SetColumn(id, column)` — dispatches to the existing state-machine transitions (`StartDevelopment`, `MoveToReview`, `MoveToDone`, `RejectToInProgress`), returning `ErrIllegalTransition` for anything else.
- `AddAcceptanceCriterion(id, text)`
- `RemoveAcceptanceCriterion(id, index)`

**Existing methods reused by MCP tools:**

- `set_title`, `set_description`, `set_complexity`, `set_acceptance_criteria`, `set_relevant_files` route through the existing `UpdateFields(id, map[string]any)` whitelist path. `UpdateFields` is extended to also stamp `UpdatedAt`. No new dedicated setters are added for these — the whitelist already validates them, and adding parallel setters would duplicate logic.

The store's existing `Update` method stays unchanged — it already does a full replacement.

## MCP tool surface

All tools are prefixed `mcp__agent_desk__`. The CLI allowlist is a wildcard on this prefix.

| Tool | Args | Effect |
|---|---|---|
| `get_card` | — | Returns the session's card as JSON |
| `set_status` | `column: enum` | Moves column, validated against state machine |
| `set_title` | `title: string (≤200)` | Updates title |
| `set_description` | `description: string (≤8000)` | Updates description (markdown) |
| `set_summary` | `summary: string (≤280)` | Sets one-line status; `""` clears |
| `set_complexity` | `complexity: "low"\|"medium"\|"high"` | Sets complexity |
| `set_progress` | `step: int, totalSteps: int, currentStep: string` | Updates progress snapshot |
| `clear_progress` | — | Sets progress to null |
| `set_blocked` | `reason: string (non-empty)` | Marks blocked with reason |
| `clear_blocked` | — | Clears blocked reason |
| `add_label` | `label: string` | Adds label (trimmed, deduped) |
| `remove_label` | `label: string` | Removes label |
| `add_acceptance_criterion` | `text: string` | Appends to AC list |
| `remove_acceptance_criterion` | `index: int` | Removes AC at index |
| `set_acceptance_criteria` | `items: string[]` | Replaces full AC list |
| `set_relevant_files` | `paths: string[]` | Replaces relevant files list |

**16 tools total.** Each handler is ~10–20 LOC: validate shape, call `card.Service`, return `CallToolResult`.

**Excluded (out of scope):** `set_model`, `set_effort` (user-controlled), `set_pr_url`, `set_worktree` (backend-workflow-controlled), `delete_card`, `create_card`.

### Session scoping

The MCP server mints a token per agent-subprocess spawn and maps `token → cardId` in an in-memory registry with an expiry tied to the subprocess lifetime. Every MCP request includes the token as a query param (`?token=...`). The server resolves the scoped `cardId` from the token before dispatching the tool call — **the agent never passes `cardId` as an argument**. This makes cross-card mutation architecturally impossible: the footgun is removed, not validated.

Unknown or expired tokens return HTTP 401. Tokens are revoked when the subprocess exits (`manager` cleanup).

## Data flow

### Happy path: `set_summary`

1. Agent emits tool-use block: `{name: "mcp__agent_desk__set_summary", input: {summary: "Refactoring auth middleware"}}`.
2. Claude CLI invokes HTTP MCP at `backend:<port>/mcp?token=T` via JSON-RPC `tools/call`.
3. Backend MCP handler resolves `T → cardId`, dispatches to `set_summary` handler → `card.Service.SetSummary(cardId, summary)`.
4. Service validates (≤280 chars), updates the card, stamps `UpdatedAt`, calls `store.Update`, invokes `broadcastCard(cardId)`.
5. Broadcast sends `{type: "card_update", fields: {summary, updatedAt}}` over the WebSocket. Frontend `useCardSocket` merges into local state. UI re-renders.
6. MCP returns `CallToolResult { content: "ok", isError: false }` to the CLI. The CLI feeds the result back into the agent's context. Agent continues.
7. In parallel, the tool-use block and tool-result stream through the existing stream-json → WS bridge as `block_start` / `block_stop` / `tool_result` events. The chat pane renders them as semantic chips.

### Error path: illegal transition

- Agent calls `set_status("done")` while `column == "in_progress"`.
- `card.Service.SetColumn` returns `ErrIllegalTransition`.
- MCP handler returns `CallToolResult { content: "cannot move in_progress → done; must go through review first", isError: true }`.
- CLI surfaces this as a tool-result with `is_error: true`. Agent sees the error, calls `set_status("review")` instead.
- Frontend renders the errored tool result with a red border.

### Error path: invalid input

- Agent calls `set_summary("<300-char string>")`.
- MCP layer's JSON-schema validation (`maxLength: 280`) rejects the call before it reaches the service. Agent retries with a shorter summary.

### Error path: wrong session

- MCP request arrives with an unknown or expired token → HTTP 401 → CLI surfaces as transport error. The agent sees it and is stuck on that mutation (this should never happen in practice because tokens are minted fresh per spawn).

### Concurrency

- `card.Service` already uses a `sync.RWMutex` via `store`. No new locks.
- `UpdatedAt` is race-free as last-writer-wins via `time.Now().UnixMilli()`.

### Frontend reconciliation

The existing `card_update` WebSocket message and `useCardSocket` hook already merge arbitrary partial card updates into local state. New fields flow through with zero frontend wire-protocol changes.

## UI surface

The screenshot shows a card with just `Backlog / blok / New Card` and nothing else. The UI additions assume the agent populates the new fields, so every new element is conditional on a non-empty/non-null value.

### BoardCard (column thumbnail)

- **Today:** title only.
- **Add below title:**
  - `summary` as a secondary line (1 line, ellipsis) — only if non-empty
  - `labels` as a small horizontal chip row — only if non-empty
  - `progress` as a thin horizontal bar showing `step / totalSteps` — only if non-null
  - `blockedReason` present → amber dot in the corner and tinted column border

### CardContent (modal left pane)

Current order: column badge → project → title → description → AC → complexity → relevant files → worktree → PR.

**Insert between title and description, each conditional:**

- `summary` block (larger text, italic) — only if non-empty
- `progress` block: `currentStep` text + `step/totalSteps · ▓▓▓░░` bar — only if non-null
- `blockedReason` banner: amber background with ⚠ + reason — only if non-empty

**Additional:**

- `labels` chips under the column-badge row (horizontal wrap)
- `updatedAt` shown in the corner as "updated 14s ago" relative time, ticking via a short interval

### ChatPanel tool-use rendering

- **Today:** `block_start` with `kind: "tool_use"` renders a generic chip showing `toolName`.
- **Add:** a label map from `mcp__agent_desk__*` names to human labels:
  - `set_summary` → "Summary"
  - `set_status` → "Status → {column}"
  - `set_progress` → "Progress: {step}/{totalSteps}"
  - `add_label` → "+Label {x}"
  - (and so on for all 16)
- Show `input` summarized next to the label. Errored tool results get a red border.

### Unchanged

- `useCardSocket` wire protocol
- `CardModal` shell
- Routing, drag-drop, keyboard shortcuts
- All existing fields

## Testing strategy (TDD)

Every unit gets a failing test first, then implementation. Parallel subagents during execution — each owns an isolated layer.

### Backend unit tests

**`card/service_test.go`** (new tests on existing file):

- `TestSetSummary_Trims_MaxLen_StampsUpdatedAt`
- `TestSetProgress_ValidatesStepBounds`
- `TestClearProgress_SetsNil`
- `TestSetBlocked_NonEmpty_ClearBlocked_Empties`
- `TestAddLabel_DedupTrim_RemoveLabel`
- `TestSetColumn_DispatchesToStateMachine_RejectsIllegal`
- `TestAnyMutation_StampsUpdatedAt` — table-driven across every setter

**`card/store_test.go`** — extend `Update` round-trip coverage with the new fields.

**`mcp/server_test.go`** (new package):

- `TestSessionToken_ScopesToCardId`
- `TestUnknownToken_Returns401`
- `TestToolCall_SetSummary_InvokesService`
- `TestToolCall_InvalidInput_ReturnsIsErrorTrue`
- `TestToolCall_IllegalStateTransition_ReturnsIsErrorTrue`
- `TestListTools_ReturnsAllSixteen`
- `TestConcurrentSessions_IsolatedByToken`
- Table-driven per tool: valid input → service call, invalid → error

**`mcp/tools_test.go`** — schema snapshot tests so schema drift surfaces as a diff.

**`agent/manager_test.go`** — extend:

- `TestSend_WritesMcpConfig_WithSessionToken`
- `TestSend_AddsAllowedToolsFlag`

**`websocket/handler_test.go`** — extend:

- `TestBroadcastCard_IncludesNewFields`

### Frontend unit tests

**`features/card/CardContent.test.tsx`** — extend `makeCard` factory:

- `rendersSummary_whenPresent`
- `hidesSummary_whenEmpty`
- `rendersProgressBar_withStepFraction`
- `rendersBlockedBanner_whenReasonSet`
- `rendersLabelChips`
- `rendersRelativeUpdatedAt`

**`features/board/BoardCard.test.tsx`** (create if absent): thumbnail renders summary / labels / progress / blocked dot.

**`features/chat/ToolUseChip.test.tsx`**: typed label mapping for `mcp__agent_desk__*`.

### Integration (one E2E happy path)

**`backend/internal/mcp/integration_test.go`**:

- Start backend via `httptest`, mount MCP, create card, mint session token, POST `tools/call` for `set_summary`, assert store mutated and `broadcastCard` fired with new fields.

### Test order

1. Data model change (`Card` struct) — types compile, existing tests still pass
2. Service methods — red, green, refactor
3. MCP server + tool handlers — red, green
4. Manager spawn wiring — red, green
5. Frontend rendering — red, green
6. Integration test — red, green

## File layout

### New files

```
backend/internal/mcp/
  server.go             — HTTP MCP server (JSON-RPC over streamable HTTP)
  server_test.go
  session.go            — token → cardId map, mint/revoke/lookup
  session_test.go
  tools.go              — tool schema definitions (all 16)
  tools_test.go         — schema snapshot
  handlers.go           — one fn per tool, dispatches to card.Service
  handlers_test.go
  integration_test.go

frontend/src/features/card/ProgressBar.tsx
frontend/src/features/card/ProgressBar.module.css
frontend/src/features/card/BlockedBanner.tsx
frontend/src/features/card/BlockedBanner.module.css
frontend/src/features/card/LabelChips.tsx
frontend/src/features/card/LabelChips.module.css
frontend/src/features/chat/ToolUseChip.tsx          (if not already present)
frontend/src/features/chat/agentDeskToolLabels.ts   — mcp__agent_desk__* → human label
```

### Modified files

```
backend/internal/card/card.go           — add Labels, Summary, BlockedReason, Progress, UpdatedAt
backend/internal/card/service.go        — new setters, UpdatedAt stamping
backend/internal/card/service_test.go   — new tests
backend/internal/card/store_test.go     — extend round-trip
backend/internal/agent/manager.go       — mint session, write .mcp.json, add --mcp-config + --allowed-tools
backend/internal/agent/manager_test.go  — new tests
backend/cmd/agent-desk/main.go          — mount mcp.Server at /mcp
backend/internal/websocket/handler_test.go — extend broadcast test

frontend/src/shared/types/domain.ts     — add fields to Card type
frontend/src/features/card/CardContent.tsx + .test.tsx
frontend/src/features/board/BoardCard.tsx (or equivalent thumbnail) + test
```

## Parallel subagent decomposition

Five subagents, owning disjoint file sets:

- **Agent 1 — backend data model + service.** Owns `card/card.go`, `card/service.go`, `card/service_test.go`, `card/store_test.go`. Adds struct fields, service setters, tests, store round-trip.
- **Agent 2 — backend MCP package.** Owns `internal/mcp/**`. Schemas, handlers, session registry, server, tests, integration test. Depends on Agent 1 finishing (uses the real `card.Service`; may start against a service interface stub).
- **Agent 3 — backend wiring.** Owns `agent/manager.go`, `agent/manager_test.go`, `cmd/agent-desk/main.go`. Mints sessions, writes `.mcp.json`, adds CLI flags, mounts the MCP server. Depends on Agent 2 exposing an MCP server constructor.
- **Agent 4 — frontend types + CardContent.** Owns `shared/types/domain.ts`, `features/card/**`. Adds card-type fields; renders summary, progress, blocked, labels, `updatedAt`; new leaf components.
- **Agent 5 — frontend board thumbnail + tool-use chip.** Owns `features/board/BoardCard.tsx` + test, `features/chat/ToolUseChip.tsx` + test, `features/chat/agentDeskToolLabels.ts`.

**Dependencies:** `1 → 2 → 3`; Agents 4 and 5 run parallel to 1–3 (the frontend can land with optional fields that default to empty/null, so no ordering constraint with the backend).

**Realistic launch order:** Agents 1, 4, 5 dispatched together; Agent 2 dispatched after Agent 1 lands; Agent 3 dispatched after Agent 2 lands.

## Out of scope (future specs)

- Agent creating or deleting cards
- `ActivityLog` audit stream
- Multi-card agent operations
- Drag-drop UI changes
- Label filtering UI
- Priority, test status, commit SHAs
- Remote/distributed backend
