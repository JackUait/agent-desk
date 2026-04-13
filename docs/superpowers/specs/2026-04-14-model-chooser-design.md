# Model Chooser — Design

**Status:** approved
**Date:** 2026-04-14

## Problem

Agent Desk hardcodes the Claude CLI default model for every card. Users want to
pick a model per card so cheap chatter (clarifying questions in Backlog) can run
on Haiku while hard implementation work runs on Opus, without spinning up a new
app or editing configs.

## Goals

- Per-card model selection, persisted server-side on the `Card`.
- Inline model dropdown in the chat composer, changeable per message.
- Friendly labels in the UI, pinned full model IDs on the wire.
- Sticky "last chosen" model for *new* cards via frontend localStorage.
- Opus 4.6 as the first-ever default when no prior choice exists.
- Strict TDD: failing test → implementation → commit, one commit per slice.

## Non-goals

- `--fallback-model` support.
- Per-turn cost math that adjusts based on model.
- Admin UI for editing the allowed-models list (hardcoded on the backend).
- Migration of existing cards — they land with `model: ""` and pick up the
  default on first send.

## User decisions captured during brainstorming

| # | Question | Choice |
|---|----------|--------|
| 1 | Scope | Per-card, persisted on `Card` |
| 2 | Model set | Friendly labels, full IDs on the wire |
| 3 | Placement | Inline in the chat composer, changeable per message |
| 4 | Transport | Bundle `model` on the existing `message` WS frame |
| 5 | Default | Opus 4.6 first-ever; sticky last-chosen for subsequent new cards |

## Architecture

### Data model

`backend/internal/card/card.go` — add `Model string \`json:"model"\`` to the
`Card` struct. Empty string means "not yet set"; callers treat it as
`claude-opus-4-6` at spawn time.

`frontend/src/shared/types/domain.ts` — mirror with `model: string` on the
`Card` interface. Extend the `message` variant of `WSClientMessage` with an
optional `model?: string`.

### Allowed models (single source of truth)

`backend/internal/agent/models.go`:

```go
var AllowedModels = []Model{
    {ID: "claude-opus-4-6",   Label: "Opus 4.6"},
    {ID: "claude-sonnet-4-6", Label: "Sonnet 4.6"},
    {ID: "claude-haiku-4-5",  Label: "Haiku 4.5"},
}

func IsAllowed(id string) bool { ... }
```

Exposed via `GET /api/models` → `[{id, label}]`. The frontend fetches this
once on boot so the dropdown is driven by the server list.

### Backend flow

1. `card.Service.SetModel(id, model)` validates against `agent.IsAllowed` and
   persists via the store. Returns `(Card, error)`.
2. `agent.Manager.Send(cardID, sessionID, model, message, events)` — new
   `model` parameter. If non-empty, append `--model <id>` to the CLI args.
   Empty string omits the flag. Validation is the caller's job.
3. WebSocket handler on `message` frame:
   - Parse optional `model` field.
   - If present and `!IsAllowed` → `broadcastError("unknown model: X")`, skip
     spawn.
   - If present and valid → `cardSvc.SetModel`, broadcast `card_update`, then
     spawn with that model.
   - If absent → spawn with the card's persisted `Card.Model`.
4. `start` and `approve` frames are **unchanged**. They re-use
   `Card.Model` as-is — they're not user messages, so they don't carry a
   selector.

### Frontend flow

`frontend/src/features/chat/ModelChooser.tsx` — new component, props
`{ models, value, onChange, disabled }`. Rendered as a styled native `<select>`.

`frontend/src/features/chat/useModels.ts` — `useEffect` + `fetch('/api/models')`
on mount, returns `{ models, loading }`. No React Query, stdlib only.

`ChatPanel.tsx` composer becomes a flex column:

```
Row 1: <textarea />
Row 2: [ ModelChooser ] ................ [ Send ]
```

`ChatPanel` owns `selectedModel` local state, initialised from:

1. `card.model` if non-empty
2. else `localStorage.getItem('agentDesk.lastModel')`
3. else `'claude-opus-4-6'`

`onSend` signature changes from `(content: string) => void` to
`(content: string, model: string) => void`. On send, the component also writes
`localStorage.setItem('agentDesk.lastModel', selectedModel)`.

Incoming `card_update` events with a new `model` field re-sync `selectedModel`
to keep multi-tab views in agreement.

The chooser is disabled while `chatStream.turnInFlight` is true — the in-flight
turn owns the current model, and changing mid-stream would race.

`CardModal` and `App` pass the `models` list down; `useCardSocket.send` grows a
`model` argument that it stamps onto the WS `message` frame.

### Styling

Existing chat accent color. Padding matches the Send button so the row looks
intentional. No custom dropdown chrome — native `<select>` only.

## TDD order (one commit per step)

1. **Backend:** `agent.AllowedModels` + `GET /api/models` handler.
   Tests: handler returns the three entries.
2. **Backend:** `Card.Model` field + `card.Service.SetModel`.
   Tests: happy path, unknown model rejected, unknown card rejected.
3. **Backend:** `agent.Manager.Send` accepts `model`.
   Tests: non-empty → `--model` in args; empty → absent. Update existing
   callers to pass `""`.
4. **Backend:** WS handler wires `model` on `message` frame.
   Tests: valid → `SetModel` + spawn with flag; invalid → error broadcast, no
   spawn; absent → persisted value used; `start` frame ignores client model.
5. **Frontend:** extend `Card` type + `WSClientMessage.message` with `model`.
6. **Frontend:** `useModels` hook tests + implementation.
7. **Frontend:** `ModelChooser` component tests + implementation.
8. **Frontend:** `ChatPanel` integration — init from card/localStorage/default,
   onSend carries model, disabled during in-flight, localStorage stickiness.
9. **Frontend:** `CardModal` + `App` plumbing; `useCardSocket.send` signature
   update; smoke test in `CardModal.test.tsx`.
10. **Manual verification:** dev server round trip — pick Sonnet, send,
    confirm `claude --model claude-sonnet-4-6` via `ps`; reopen card → sticky;
    new card → last-chosen sticky.

## Test coverage summary

Backend:
- `agent/models_test.go`: `AllowedModels`, `IsAllowed` positive/negative.
- `agent/models_handler_test.go`: `GET /api/models` payload.
- `card/service_test.go`: `SetModel` happy path + both error paths.
- `agent/manager_test.go`: spawn args include `--model` iff non-empty.
- `websocket/handler_test.go`: four WS cases above.

Frontend:
- `useModels.test.ts`: fetches `/api/models`, returns list.
- `ModelChooser.test.tsx`: renders, `onChange`, `disabled`.
- `ChatPanel.test.tsx`: init priority (card → localStorage → default),
  `onSend(content, model)`, disabled while `turnInFlight`, localStorage write
  on send.
- `CardModal.test.tsx`: chooser renders inside modal.

## Completion checklist

- [ ] `cd frontend && yarn test` — all pass
- [ ] `cd backend && go test ./...` — all pass
- [ ] `cd frontend && yarn build` — clean
- [ ] `cd backend && go build ./...` — clean
- [ ] `cd frontend && yarn lint` — clean
- [ ] Manual round trip via dev server
- [ ] All commits descriptive, one per TDD slice
