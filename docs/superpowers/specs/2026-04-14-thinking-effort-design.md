# Thinking Effort Selector — Design

**Status:** approved
**Date:** 2026-04-14

## Problem

Agent Desk lets users pick a model per card but always runs with the CLI's
default thinking behavior. Users want to tune how hard the model thinks —
cheap clarifying chatter on `low`, hard implementation work on `max` — without
restarting the CLI or editing configs. All three hardcoded models
(Opus 4.6, Sonnet 4.6, Haiku 4.5) support extended thinking and the Claude
Code CLI already exposes `--effort <low|medium|high|max>`.

## Goals

- Per-card thinking effort, persisted server-side on the `Card`.
- Nested dropdown in the chat composer — pick `{model, effort}` as one action.
- Friendly labels in the UI, enum values on the wire.
- Sticky last-chosen `{model, effort}` pair via frontend localStorage for
  *new* cards.
- `medium` as the effort default when no prior choice exists.
- Strict TDD: failing test → implementation → commit, one commit per slice.

## Non-goals

- Per-model effort defaults. Stickiness is one combined pair, not per-model.
- Custom budget_tokens input — only the four CLI enum values.
- Migration of existing cards — they land with `effort: ""` and pick up the
  default on first send.
- Admin UI for editing the allowed-efforts list (hardcoded both sides).

## User decisions captured during brainstorming

| # | Question | Choice |
|---|----------|--------|
| 1 | Which models show the effort control | All three — CLI supports effort on Opus/Sonnet/Haiku |
| 2 | Effort levels exposed | Full enum: `low / medium / high / max` |
| 3 | UI placement | Nested submenu — each model expands to effort sub-options |
| 4 | Persistence + default | Persist on `Card.Effort`, localStorage sticky, default `medium` |
| 5 | Stickiness granularity | One combined last-choice pair `{model, effort}` |
| 6 | Composer trigger label | `model · effort` (e.g. `Opus 4.6 · high`) |

## Architecture

### Data model

`backend/internal/card/card.go` — add `Effort string \`json:"effort"\`` to the
`Card` struct. Empty string means "not yet set"; callers substitute `"medium"`
at spawn time.

`frontend/src/shared/types/domain.ts` — mirror with `effort: string` on the
`Card` interface. Extend the `message` variant of `WSClientMessage` with an
optional `effort?: string`.

### Allowed efforts (single source of truth)

`backend/internal/agent/models.go`:

```go
var AllowedEfforts = []string{"low", "medium", "high", "max"}

func IsAllowedEffort(e string) bool { ... }
```

No `GET /api/efforts` endpoint. The list is static and hardcoded on the
frontend as well, exported as `EFFORTS` from `features/chat/useModels.ts`.
Backend still validates on the wire — frontend constant is convenience, not
source of truth.

### Backend flow

1. `card.Service.SetEffort(id, effort)` validates against
   `agent.IsAllowedEffort` and persists via the store. Returns
   `(Card, error)`. Parallel in shape to `SetModel`.
2. `agent.Manager.Send(cardID, sessionID, model, effort, message, events)` —
   new `effort` parameter. Build-args order is `--model <id>` before
   `--effort <e>` before the positional prompt. Each flag is appended only
   when its argument is non-empty. A resolved-empty effort at spawn time is
   substituted with `"medium"` (parallels the model default-to-opus policy).
3. WebSocket handler on the `message` frame:
   - Parse optional `effort` field alongside existing `model`.
   - If present and invalid → `broadcastError("unknown effort: X")`, skip spawn.
   - If present and valid → `cardSvc.SetEffort`, broadcast `card_update`,
     then spawn with that effort.
   - If absent → spawn with the card's persisted `Card.Effort`.
4. `start` and `approve` frames are **unchanged**. They re-use `Card.Effort`
   as-is — they're not user messages, so they don't carry a selector.

### Frontend flow

`frontend/src/features/chat/ModelChooser.tsx` — rewritten from shadcn `Select`
to shadcn `DropdownMenu` with `DropdownMenuSub`. Each model is a
`SubTrigger`; opening it reveals the four effort items as
`DropdownMenuCheckboxItem`s. Leaf-only check mark on the active pair — no
parent indicator; the trigger label already shows the pair.

Props become `{ models, value: {model, effort}, onChange, disabled }`.
Trigger displays `${modelLabel} · ${effort}`.

`frontend/src/features/chat/useModels.ts` — unchanged contract for model
fetch; additionally exports `EFFORTS` constant
`['low', 'medium', 'high', 'max']`.

`ChatPanel.tsx` owns `selection: {model, effort}` state, initialised from:

1. `card.model` **and** `card.effort` both non-empty → that pair.
2. Else `localStorage.getItem('agentDesk.lastSelection')` if parseable → that
   pair.
3. Else `{model: 'claude-opus-4-6', effort: 'medium'}`.

Partial card state (e.g. `card.model` set but `card.effort` empty) is treated
as "not fully set" and falls through to localStorage. Simpler than mixing
sources; the first send will persist the full pair.

**localStorage migration:** new key `agentDesk.lastSelection` stores
`JSON.stringify({model, effort})`. On read, if the new key is missing but the
old `agentDesk.lastModel` key is present, seed
`{model: oldValue, effort: 'medium'}`. Remove the old key on the next write.

`onSend` signature changes from `(content: string) => void` to
`(content: string, model: string, effort: string) => void`. On send, the
component writes `localStorage.setItem('agentDesk.lastSelection', ...)`.

Incoming `card_update` events with new `model` or `effort` fields re-sync
`selection` to keep multi-tab views in agreement.

The chooser is disabled while `chatStream.turnInFlight` is true — the
in-flight turn owns the current pair, and changing mid-stream would race.

`CardModal` and `App` pass the `models` list down; `useCardSocket.send` grows
an `effort` argument that it stamps onto the WS `message` frame next to
`model`.

### Styling

Existing chat accent color. Submenu chrome comes from shadcn defaults. No
custom dropdown styling.

## TDD order (one commit per step)

### Backend

1. **`agent.AllowedEfforts` + `IsAllowedEffort`.**
   Tests: enum contents; positive and negative cases.
2. **`Card.Effort` field + `card.Service.SetEffort`.**
   Tests: happy path, unknown effort rejected, unknown card rejected.
3. **`agent.Manager.Send` accepts `effort`.**
   Tests: non-empty → `--effort` in argv; empty → absent; `--model` before
   `--effort` before positional prompt; resolved-empty defaults to `medium`
   at spawn. Update existing callers to pass `""`.
4. **WS handler wires `effort` on `message` frame.**
   Tests: valid → `SetEffort` + spawn with flag; invalid → error broadcast,
   no spawn; absent → persisted value used; `start` frame ignores client
   effort.

### Frontend

5. **Types:** extend `Card` with `effort` and `WSClientMessage.message` with
   `effort?`. No test (types only).
6. **`ModelChooser` component** tests + rewrite to `DropdownMenu` with
   submenus. Tests: renders nested submenu; clicking a leaf fires
   `onChange({model, effort})`; trigger label `${modelLabel} · ${effort}`;
   `disabled` propagates; check mark only on selected leaf.
7. **`useModels` exports `EFFORTS` constant.** Tests: constant contents.
8. **`ChatPanel` integration.** Tests: init priority (card → localStorage →
   default), partial-card fallthrough, localStorage migration from
   `lastModel`, `onSend(content, model, effort)`, disabled while
   `turnInFlight`, localStorage write on send, `card_update` resync for
   effort.
9. **`CardModal` smoke:** chooser renders with effort visible inside modal.
10. **`useCardSocket.send(content, model, effort)`** stamps both onto the
    frame (extend existing socket test file).

### Manual verification

11. Dev server round trip — pick `Sonnet · high`, send, confirm
    `claude --model claude-sonnet-4-6 --effort high` via `ps`; reopen card →
    sticky; new card → last-chosen pair sticky; multi-tab `card_update`
    syncs both model and effort.

## Test coverage summary

Backend:
- `agent/models_test.go`: `AllowedEfforts`, `IsAllowedEffort` positive/negative.
- `card/service_test.go`: `SetEffort` happy path + both error paths.
- `agent/buildargs_test.go` + `agent/manager_test.go`: spawn args include
  `--effort` iff non-empty; order; default substitution.
- `websocket/handler_test.go`: four WS cases above.

Frontend:
- `chat/useModels.test.ts`: `EFFORTS` constant.
- `chat/ModelChooser.test.tsx`: nested submenu, leaf click, trigger label,
  disabled, check mark placement.
- `chat/ChatPanel.test.tsx`: init priority, partial-card fallthrough,
  localStorage migration, `onSend(content, model, effort)`, disabled while
  `turnInFlight`, localStorage write on send, `card_update` resync.
- `card/CardModal.test.tsx`: chooser with effort renders inside modal.
- `chat/useCardSocket.test.ts`: `send` signature stamps both fields.

## Completion checklist

- [ ] `cd frontend && yarn test` — all pass
- [ ] `cd backend && go test ./...` — all pass
- [ ] `cd frontend && yarn build` — clean
- [ ] `cd backend && go build ./...` — clean
- [ ] `cd frontend && yarn lint` — clean
- [ ] Manual round trip via dev server
- [ ] All commits descriptive, one per TDD slice
