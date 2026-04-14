# Thinking Effort Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-card thinking effort selection (low/medium/high/max) alongside the existing model picker, wired through the Claude CLI's `--effort` flag, with a nested submenu UI and localStorage stickiness for new cards.

**Architecture:** Backend adds an `AllowedEfforts` enum + `Card.Effort` field + `SetEffort` service method + `--effort` CLI flag in `buildArgs`. The WS `message` frame parses an optional `effort` alongside the existing `model`. Frontend rewrites `ModelChooser` from shadcn `Select` → a nested menu built on `@base-ui/react/menu`, collapses `selectedModel` into a single `{model, effort}` selection state, and migrates the localStorage key from `agentDesk.lastModel` → `agentDesk.lastSelection`.

**Tech Stack:** Go (net/http, stdlib), React 19 + TypeScript, Vitest + React Testing Library, shadcn wrappers over `@base-ui/react`.

**Spec:** `docs/superpowers/specs/2026-04-14-thinking-effort-design.md`

---

## File Structure

**Backend (Go)**

| File | Responsibility |
|---|---|
| `backend/internal/agent/models.go` | Add `AllowedEfforts` + `IsAllowedEffort` |
| `backend/internal/agent/models_test.go` | Tests for the above |
| `backend/internal/card/card.go` | Add `Effort string \`json:"effort"\`` |
| `backend/internal/card/service.go` | Add `SetEffort` |
| `backend/internal/card/service_test.go` | Tests for `SetEffort` |
| `backend/internal/agent/manager.go` | `buildArgs` + `SendRequest` learn about effort |
| `backend/internal/agent/buildargs_test.go` | Tests for argv shape |
| `backend/internal/agent/manager_test.go` | Update call sites, argv-contains assertions |
| `backend/internal/websocket/handler.go` | Parse `effort` on the `message` frame |
| `backend/internal/websocket/handler_test.go` | Four WS cases (valid / invalid / absent / `start` ignored) |

**Frontend (TypeScript/React)**

| File | Responsibility |
|---|---|
| `frontend/src/shared/types/domain.ts` | `Card.effort`, `WSClientMessage.message.effort?` |
| `frontend/src/features/chat/useModels.ts` | Export `EFFORTS` constant + `Effort` type |
| `frontend/src/features/chat/useModels.test.ts` | Test `EFFORTS` constant |
| `frontend/src/components/ui/menu.tsx` | **New** shadcn-style wrapper over `@base-ui/react/menu` with submenu support |
| `frontend/src/features/chat/ModelChooser.tsx` | Rewrite to nested menu; new `{model, effort}` prop contract |
| `frontend/src/features/chat/ModelChooser.test.tsx` | Nested submenu, leaf click, trigger label, disabled, checkmark |
| `frontend/src/features/chat/ChatPanel.tsx` | Single `selection` state; migration; `onSend(c, m, e)` |
| `frontend/src/features/chat/ChatPanel.test.tsx` | Init priority, migration, resync, localStorage write, onSend signature |
| `frontend/src/shared/api/useCardSocket.ts` | `sendMessage(content, model?, effort?)` |
| `frontend/src/shared/api/useCardSocket.test.ts` | Stamps both fields on frame |
| `frontend/src/features/card/CardModal.tsx` | Prop signature update, passes `onSend` through |
| `frontend/src/features/card/CardModal.test.tsx` | Chooser with effort renders inside modal |

---

## Commit message convention

Every commit in this plan uses `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` as the trailer.

---

## Task 1: Backend — `AllowedEfforts` + `IsAllowedEffort`

**Files:**
- Modify: `backend/internal/agent/models.go`
- Test: `backend/internal/agent/models_test.go`

- [ ] **Step 1.1: Write the failing test**

Append to `backend/internal/agent/models_test.go`:

```go
func TestAllowedEfforts_ExactSetAndOrder(t *testing.T) {
	want := []string{"low", "medium", "high", "max"}
	if len(AllowedEfforts) != len(want) {
		t.Fatalf("AllowedEfforts length = %d, want %d: %v", len(AllowedEfforts), len(want), AllowedEfforts)
	}
	for i, e := range want {
		if AllowedEfforts[i] != e {
			t.Errorf("AllowedEfforts[%d] = %q, want %q", i, AllowedEfforts[i], e)
		}
	}
}

func TestIsAllowedEffort_AcceptsKnownValues(t *testing.T) {
	for _, e := range []string{"low", "medium", "high", "max"} {
		if !IsAllowedEffort(e) {
			t.Errorf("IsAllowedEffort(%q) = false, want true", e)
		}
	}
}

func TestIsAllowedEffort_RejectsUnknownAndEmpty(t *testing.T) {
	for _, e := range []string{"", "LOW", "ultra", "MEDIUM", "fast"} {
		if IsAllowedEffort(e) {
			t.Errorf("IsAllowedEffort(%q) = true, want false", e)
		}
	}
}
```

- [ ] **Step 1.2: Run the test and confirm it fails**

```bash
cd backend && go test ./internal/agent/ -run 'TestAllowedEfforts_ExactSetAndOrder|TestIsAllowedEffort' -v
```

Expected: FAIL — undefined: `AllowedEfforts`, `IsAllowedEffort`.

- [ ] **Step 1.3: Write minimal implementation**

Append to `backend/internal/agent/models.go`:

```go
// AllowedEfforts is the hardcoded list of thinking effort levels the Claude
// CLI accepts via its --effort flag. Order is user-facing.
var AllowedEfforts = []string{"low", "medium", "high", "max"}

// IsAllowedEffort reports whether e is one of AllowedEfforts. The empty
// string is not allowed (empty means "no effort override, use CLI default").
func IsAllowedEffort(e string) bool {
	if e == "" {
		return false
	}
	for _, x := range AllowedEfforts {
		if x == e {
			return true
		}
	}
	return false
}
```

- [ ] **Step 1.4: Run the test and confirm it passes**

```bash
cd backend && go test ./internal/agent/ -run 'TestAllowedEfforts_ExactSetAndOrder|TestIsAllowedEffort' -v
```

Expected: PASS.

- [ ] **Step 1.5: Run the full agent package tests to confirm no regressions**

```bash
cd backend && go test ./internal/agent/...
```

Expected: all PASS.

- [ ] **Step 1.6: Commit**

```bash
cd backend && git add internal/agent/models.go internal/agent/models_test.go && git commit -m "$(cat <<'EOF'
feat(backend): add AllowedEfforts registry for thinking effort

Parallels AllowedModels — hardcoded list of low/medium/high/max that
the Claude CLI accepts via --effort. IsAllowedEffort rejects empty.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — `Card.Effort` field + `Service.SetEffort`

**Files:**
- Modify: `backend/internal/card/card.go`
- Modify: `backend/internal/card/service.go`
- Test: `backend/internal/card/service_test.go`

- [ ] **Step 2.1: Write the failing tests**

Append to `backend/internal/card/service_test.go`:

```go
func TestSetEffort_HappyPath(t *testing.T) {
	store := NewStore()
	svc := NewService(store)
	c := svc.CreateCard("proj-1", "Card")

	updated, err := svc.SetEffort(c.ID, "high")
	if err != nil {
		t.Fatalf("SetEffort: unexpected error: %v", err)
	}
	if updated.Effort != "high" {
		t.Errorf("returned Effort = %q, want %q", updated.Effort, "high")
	}
	got, _ := svc.GetCard(c.ID)
	if got.Effort != "high" {
		t.Errorf("persisted Effort = %q, want %q", got.Effort, "high")
	}
}

func TestSetEffort_UnknownEffortRejected(t *testing.T) {
	store := NewStore()
	svc := NewService(store)
	c := svc.CreateCard("proj-1", "Card")

	_, err := svc.SetEffort(c.ID, "ultra")
	if err == nil {
		t.Fatalf("SetEffort(ultra): expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unknown effort") {
		t.Errorf("error = %q, want containing %q", err.Error(), "unknown effort")
	}
}

func TestSetEffort_UnknownCardRejected(t *testing.T) {
	store := NewStore()
	svc := NewService(store)

	_, err := svc.SetEffort("no-such-card", "low")
	if err == nil {
		t.Fatalf("SetEffort(missing card): expected error, got nil")
	}
}
```

If `strings` is not yet imported in the file, add it:

```go
import (
	"strings"
	"testing"
	// ... existing imports
)
```

- [ ] **Step 2.2: Run the tests and confirm they fail**

```bash
cd backend && go test ./internal/card/ -run TestSetEffort -v
```

Expected: FAIL — `svc.SetEffort undefined`.

- [ ] **Step 2.3: Add `Effort` to `Card` struct**

In `backend/internal/card/card.go`, add the field next to `Model`:

```go
type Card struct {
	ID                 string   `json:"id"`
	ProjectID          string   `json:"projectId"`
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Column             Column   `json:"column"`
	AcceptanceCriteria []string `json:"acceptanceCriteria"`
	Complexity         string   `json:"complexity"`
	RelevantFiles      []string `json:"relevantFiles"`
	Model              string   `json:"model"`
	Effort             string   `json:"effort"`
	SessionID          string   `json:"sessionId"`
	WorktreePath       string   `json:"worktreePath"`
	BranchName         string   `json:"branchName"`
	PRUrl              string   `json:"prUrl"`
	CreatedAt          int64    `json:"createdAt"`
}
```

- [ ] **Step 2.4: Implement `SetEffort`**

Append to `backend/internal/card/service.go` (below `SetModel`):

```go
// SetEffort validates effort against agent.AllowedEfforts and persists it on
// the card. Returns an error containing "unknown effort" when the value is
// not in the registry, or an error when the card cannot be found.
func (s *Service) SetEffort(id, effort string) (Card, error) {
	if !agent.IsAllowedEffort(effort) {
		return Card{}, fmt.Errorf("unknown effort: %s", effort)
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.Effort = effort
	s.store.Update(c)
	return c, nil
}
```

- [ ] **Step 2.5: Run the new tests and confirm they pass**

```bash
cd backend && go test ./internal/card/ -run TestSetEffort -v
```

Expected: PASS.

- [ ] **Step 2.6: Run the full card package tests for regressions**

```bash
cd backend && go test ./internal/card/...
```

Expected: all PASS.

- [ ] **Step 2.7: Commit**

```bash
cd backend && git add internal/card/card.go internal/card/service.go internal/card/service_test.go && git commit -m "$(cat <<'EOF'
feat(backend): add Card.Effort field and Service.SetEffort

Parallels Card.Model/SetModel. Validates against agent.AllowedEfforts
and persists the thinking effort on the card. Empty string means
"not yet set" and callers will omit the CLI flag.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend — `agent.Manager.Send` learns about effort

**Files:**
- Modify: `backend/internal/agent/manager.go`
- Test: `backend/internal/agent/buildargs_test.go`
- Test: `backend/internal/agent/manager_test.go` (update existing argv assertion)

- [ ] **Step 3.1: Write the failing test for `buildArgs`**

Append to `backend/internal/agent/buildargs_test.go`:

```go
func TestBuildArgs_EffortAppendedAfterModel(t *testing.T) {
	args := buildArgs("", "claude-sonnet-4-6", "high", "hello")

	modelIdx := indexOf(args, "--model")
	effortIdx := indexOf(args, "--effort")
	if modelIdx < 0 {
		t.Fatalf("expected --model in argv: %v", args)
	}
	if effortIdx < 0 {
		t.Fatalf("expected --effort in argv: %v", args)
	}
	if effortIdx < modelIdx {
		t.Errorf("--effort must come after --model: %v", args)
	}
	if args[effortIdx+1] != "high" {
		t.Errorf("--effort not followed by value 'high': %v", args)
	}
	// Prompt must still be final positional argument.
	if args[len(args)-1] != "hello" {
		t.Errorf("prompt must be last: %v", args)
	}
	// --effort must appear before the prompt.
	if effortIdx+1 >= len(args)-1 {
		t.Errorf("--effort must be before prompt: %v", args)
	}
}

func TestBuildArgs_EmptyEffortOmitted(t *testing.T) {
	args := buildArgs("", "claude-opus-4-6", "", "hello")
	if contains(args, "--effort") {
		t.Errorf("unexpected --effort in argv: %v", args)
	}
}

func TestBuildArgs_EmptyModelAndEffort(t *testing.T) {
	args := buildArgs("", "", "", "hello")
	if contains(args, "--model") || contains(args, "--effort") {
		t.Errorf("unexpected model/effort flags: %v", args)
	}
}
```

- [ ] **Step 3.2: Run the new tests and confirm they fail**

```bash
cd backend && go test ./internal/agent/ -run TestBuildArgs_Effort -v
```

Expected: FAIL — `buildArgs` currently takes 3 args not 4.

- [ ] **Step 3.3: Update `buildArgs` signature and logic**

Replace the `buildArgs` function in `backend/internal/agent/manager.go`:

```go
// buildArgs assembles the Claude CLI argv for a given session/model/effort/message.
// Non-empty sessionID appends --resume <id>; non-empty model appends
// --model <id>; non-empty effort appends --effort <level>. The prompt is
// always the final positional argument. Order: --model before --effort
// before prompt.
func buildArgs(sessionID, model, effort, message string) []string {
	args := []string{
		"-p",
		"--verbose",
		"--output-format", "stream-json",
		"--include-partial-messages",
		"--append-system-prompt", agentSystemPrompt,
	}
	if sessionID != "" {
		args = append(args, "--resume", sessionID)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	if effort != "" {
		args = append(args, "--effort", effort)
	}
	args = append(args, message)
	return args
}
```

- [ ] **Step 3.4: Add `Effort` to `SendRequest` and pass through**

In the same file, update `SendRequest`:

```go
// SendRequest carries all inputs for a single agent turn.
type SendRequest struct {
	CardID    string
	SessionID string
	Model     string
	Effort    string
	Message   string
	WorkDir   string // absolute path to the project repo
}
```

Update the `buildArgs` call in `Send`:

```go
	args := buildArgs(req.SessionID, req.Model, req.Effort, req.Message)
```

Update the doc comment on `Send` to mention the effort flag.

- [ ] **Step 3.5: Update existing `buildArgs` callers in tests**

Every existing call to `buildArgs(sessionID, model, message)` in test files under `backend/internal/agent/` must become `buildArgs(sessionID, model, "", message)`. Find them:

```bash
cd backend && grep -rn "buildArgs(" internal/agent/
```

For each non-production call, insert `""` as the new third argument. (Production callers only exist inside `manager.go`, already updated above.)

- [ ] **Step 3.6: Add a manager-level test exercising `Effort` through `Send`**

Append to `backend/internal/agent/manager_test.go` (mirror the existing `--model` tests — find the pattern by grepping `--model claude-sonnet-4-6` in that file):

```go
func TestSend_NonEmptyEffortAddsFlag(t *testing.T) {
	var capturedArgs []string
	builder := func(bin string, args []string, dir string) *exec.Cmd {
		capturedArgs = args
		// Use `true` binary so process exits immediately.
		return exec.Command("true")
	}
	m := NewManagerWithBuilder("claude", builder)

	events := make(chan StreamEvent, 4)
	if err := m.Send(SendRequest{
		CardID:  "card-1",
		Model:   "claude-sonnet-4-6",
		Effort:  "max",
		Message: "ping",
	}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-events // drain until close

	found := false
	for i, a := range capturedArgs {
		if a == "--effort" && i+1 < len(capturedArgs) && capturedArgs[i+1] == "max" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("argv missing --effort max; got %v", capturedArgs)
	}
}

func TestSend_EmptyEffortOmitsFlag(t *testing.T) {
	var capturedArgs []string
	builder := func(bin string, args []string, dir string) *exec.Cmd {
		capturedArgs = args
		return exec.Command("true")
	}
	m := NewManagerWithBuilder("claude", builder)

	events := make(chan StreamEvent, 4)
	if err := m.Send(SendRequest{
		CardID:  "card-1",
		Model:   "claude-opus-4-6",
		Effort:  "",
		Message: "ping",
	}, events); err != nil {
		t.Fatalf("Send: %v", err)
	}
	<-events

	for _, a := range capturedArgs {
		if a == "--effort" {
			t.Errorf("unexpected --effort in argv: %v", capturedArgs)
		}
	}
}
```

Ensure `"os/exec"` is imported in the test file.

- [ ] **Step 3.7: Run all agent tests and confirm they pass**

```bash
cd backend && go test ./internal/agent/...
```

Expected: all PASS. Fix compile errors in any existing test files that still call `buildArgs` with the old signature.

- [ ] **Step 3.8: Commit**

```bash
cd backend && git add internal/agent/manager.go internal/agent/buildargs_test.go internal/agent/manager_test.go && git commit -m "$(cat <<'EOF'
feat(backend): thread thinking effort through agent.Manager.Send

buildArgs now accepts effort and appends --effort <level> after
--model and before the positional prompt when non-empty. SendRequest
gains an Effort field.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend — WebSocket handler wires `effort` on `message` frame

**Files:**
- Modify: `backend/internal/websocket/handler.go`
- Test: `backend/internal/websocket/handler_test.go`

- [ ] **Step 4.1: Write the failing tests**

Append to `backend/internal/websocket/handler_test.go`. Mirror the existing model WS tests — find them via `grep -n 'unknown model\|--model claude' backend/internal/websocket/handler_test.go` and copy the scaffolding that sets up the test server, connects a WS client, and captures invocations via `argvContainsModel`. Add a helper:

```go
func argvContainsEffort(argv []string, level string) bool {
	for i, a := range argv {
		if a == "--effort" && i+1 < len(argv) && argv[i+1] == level {
			return true
		}
	}
	return false
}
```

Then add four test functions using the existing pattern (same helpers as the model tests):

```go
func TestWS_Message_ValidEffort_PersistsAndSpawnsWithFlag(t *testing.T) {
	// ... same setup as the existing --model test, but send:
	//   {"type":"message","content":"hi","model":"claude-sonnet-4-6","effort":"high"}
	// Assertions:
	//   1. cardSvc.GetCard(cardID).Effort == "high"
	//   2. argvContainsEffort(capturedArgv, "high")
	//   3. One "card_update" broadcast includes the new effort
}

func TestWS_Message_InvalidEffort_BroadcastsErrorNoSpawn(t *testing.T) {
	// Send: {"type":"message","content":"hi","model":"claude-opus-4-6","effort":"ultra"}
	// Assertions:
	//   1. An "error" frame with message containing "unknown effort" is broadcast.
	//   2. manager.Send was NEVER called (no captured argv).
	//   3. cardSvc.GetCard(cardID).Effort is unchanged (still "").
}

func TestWS_Message_AbsentEffort_UsesPersistedValue(t *testing.T) {
	// Seed card with Effort = "low" via cardSvc.SetEffort.
	// Send: {"type":"message","content":"hi"}  // no effort field
	// Assert argvContainsEffort(capturedArgv, "low").
}

func TestWS_Start_IgnoresClientEffort(t *testing.T) {
	// Seed card with Effort = "medium".
	// Send: {"type":"start","effort":"max"}  // client tries to sneak one in
	// Assert argvContainsEffort(capturedArgv, "medium") — persisted value wins.
	// Assert cardSvc.GetCard(cardID).Effort == "medium" (unchanged).
}
```

The exact test scaffolding (hub setup, manager stub builder, WS client, card seeding) must match the existing `--model` tests in the same file. Re-use their helper functions verbatim.

- [ ] **Step 4.2: Run the new tests and confirm they fail**

```bash
cd backend && go test ./internal/websocket/ -run 'TestWS_Message_.*Effort|TestWS_Start_IgnoresClientEffort' -v
```

Expected: FAIL — the handler does not read `msg.Effort`.

- [ ] **Step 4.3: Update the handler's message parser**

In `backend/internal/websocket/handler.go`, extend the inline `msg` struct:

```go
			var msg struct {
				Type    string `json:"type"`
				Content string `json:"content"`
				Model   string `json:"model,omitempty"`
				Effort  string `json:"effort,omitempty"`
			}
```

- [ ] **Step 4.4: Plumb `effort` through `sendToAgent`**

Replace the `sendToAgent` closure in `HandleWebSocket` to read `Effort` from the card:

```go
		// sendToAgent spawns a per-message Claude CLI process and bridges events.
		sendToAgent := func(message string) {
			c, _ = h.cardSvc.GetCard(cardID)
			var workDir string
			if proj, ok := h.projectStore.Get(c.ProjectID); ok {
				workDir = proj.Path
			}
			events := make(chan agent.StreamEvent, 64)
			if sendErr := h.manager.Send(agent.SendRequest{
				CardID:    cardID,
				SessionID: c.SessionID,
				Model:     c.Model,
				Effort:    c.Effort,
				Message:   message,
				WorkDir:   workDir,
			}, events); sendErr != nil {
				log.Printf("ws: send error for card %s: %v", cardID, sendErr)
				h.broadcastError(cardID, sendErr.Error())
				return
			}
			go h.StartEventBridge(cardID, events)
		}
```

- [ ] **Step 4.5: Update the `message` case to validate + persist effort**

In the `switch msg.Type { case "message": ... }` block, **after** the existing model-handling block and **before** `AppendMessage`, add:

```go
				if msg.Effort != "" {
					if !agent.IsAllowedEffort(msg.Effort) {
						h.broadcastError(cardID, "unknown effort: "+msg.Effort)
						break
					}
					updated, svcErr := h.cardSvc.SetEffort(cardID, msg.Effort)
					if svcErr != nil {
						log.Printf("ws: SetEffort error for card %s: %v", cardID, svcErr)
						h.broadcastError(cardID, svcErr.Error())
						break
					}
					h.broadcastCard(cardID, updated)
				}
```

Leave the `start`, `approve`, `merge` cases untouched — they never carry a client-supplied effort, and `sendToAgent` already reads the persisted value fresh.

- [ ] **Step 4.6: Run the new tests and confirm they pass**

```bash
cd backend && go test ./internal/websocket/ -run 'TestWS_Message_.*Effort|TestWS_Start_IgnoresClientEffort' -v
```

Expected: PASS.

- [ ] **Step 4.7: Run the full backend test suite**

```bash
cd backend && go test ./...
```

Expected: all PASS.

- [ ] **Step 4.8: Verify backend builds**

```bash
cd backend && go build ./...
```

Expected: clean.

- [ ] **Step 4.9: Commit**

```bash
cd backend && git add internal/websocket/handler.go internal/websocket/handler_test.go && git commit -m "$(cat <<'EOF'
feat(backend): WS handler parses per-message thinking effort

The message frame now accepts an optional effort field. Valid values
persist via card.Service.SetEffort and broadcast a card_update before
spawn; invalid values broadcast an error and skip the spawn. start
and approve frames continue to re-use Card.Effort as-is.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — domain type extensions

**Files:**
- Modify: `frontend/src/shared/types/domain.ts`

No new tests — type-only change; downstream tests will catch regressions.

- [ ] **Step 5.1: Extend `Card` and `WSClientMessage`**

In `frontend/src/shared/types/domain.ts`:

```ts
export interface Card {
  id: string;
  projectId: string;
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
  model: string;
  effort: string;
}

export type WSClientMessage =
  | { type: "message"; content: string; model?: string; effort?: string }
  | { type: "start" }
  | { type: "approve" }
  | { type: "merge" };
```

- [ ] **Step 5.2: Typecheck**

```bash
cd frontend && yarn tsc --noEmit
```

Expected: no TypeScript errors. If any existing file constructs a `Card` literal without `effort`, either add `effort: ""` to the literal or mark the existing field inline.

- [ ] **Step 5.3: Commit**

```bash
cd frontend && git add src/shared/types/domain.ts && git commit -m "$(cat <<'EOF'
feat(frontend): add effort field to Card and WSClientMessage.message

Mirrors backend Card.Effort and the optional WS parameter. Empty
string means "not yet set".

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — `useModels` exports `EFFORTS` constant

**Files:**
- Modify: `frontend/src/features/chat/useModels.ts`
- Test: `frontend/src/features/chat/useModels.test.ts`

- [ ] **Step 6.1: Write the failing test**

Append to `frontend/src/features/chat/useModels.test.ts`:

```ts
import { EFFORTS, type Effort } from "./useModels";

describe("EFFORTS", () => {
  it("exposes the four CLI effort levels in UX order", () => {
    expect(EFFORTS).toEqual(["low", "medium", "high", "max"]);
  });

  it("Effort type matches the EFFORTS tuple", () => {
    // Compile-time check: assigning each literal must satisfy Effort.
    const a: Effort = "low";
    const b: Effort = "medium";
    const c: Effort = "high";
    const d: Effort = "max";
    expect([a, b, c, d]).toEqual(EFFORTS);
  });
});
```

- [ ] **Step 6.2: Run the test and confirm it fails**

```bash
cd frontend && yarn test src/features/chat/useModels.test.ts --run
```

Expected: FAIL — `EFFORTS` / `Effort` not exported.

- [ ] **Step 6.3: Export `EFFORTS` and `Effort`**

Append to `frontend/src/features/chat/useModels.ts`:

```ts
export const EFFORTS = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
```

- [ ] **Step 6.4: Run the test and confirm it passes**

```bash
cd frontend && yarn test src/features/chat/useModels.test.ts --run
```

Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
cd frontend && git add src/features/chat/useModels.ts src/features/chat/useModels.test.ts && git commit -m "$(cat <<'EOF'
feat(frontend): export EFFORTS constant and Effort type from useModels

Mirrors backend AllowedEfforts on the frontend. Hardcoded — no new
endpoint — backend still validates on the wire.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — `components/ui/menu.tsx` wrapper over base-ui Menu

**Files:**
- Create: `frontend/src/components/ui/menu.tsx`

This is a new shadcn-style wrapper exposing `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem`, `MenuCheckboxItem`, `MenuSub`, `MenuSubTrigger`, `MenuSubContent`. It wraps `@base-ui/react/menu`. We deliberately keep the surface area minimal: just what `ModelChooser` needs.

No test file for this wrapper — its behavior is exercised through `ModelChooser.test.tsx`.

- [ ] **Step 7.1: Verify the base-ui Menu API is available**

```bash
cd frontend && yarn node -e "const m = require('@base-ui/react/menu'); console.log(Object.keys(m.Menu))"
```

Expected: a list of keys including `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Item`, `CheckboxItem`, `SubmenuRoot`, `SubmenuTrigger`.

If the exact key names differ (e.g. `Submenu` vs `SubmenuRoot`), adjust the imports in Step 7.2 accordingly — **this is the only task where the implementer should consult the base-ui docs**. The rest of the plan trusts whatever names this command prints.

- [ ] **Step 7.2: Create the wrapper**

Create `frontend/src/components/ui/menu.tsx`:

```tsx
import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger
const MenuSub = MenuPrimitive.SubmenuRoot

function MenuContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: MenuPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} className="isolate z-50">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "min-w-36 rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 p-1 outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuSubContent({
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={4} className="isolate z-50">
        <MenuPrimitive.Popup
          data-slot="menu-sub-content"
          className={cn(
            "min-w-28 rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 p-1 outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function MenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      className={cn(
        "relative flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-popup-open:bg-accent",
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <ChevronRightIcon className="pointer-events-none size-4 text-muted-foreground" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function MenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      checked={checked}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
}
```

**Note:** If Step 7.1 reported different primitive names (e.g. `CheckboxItemIndicator` → `CheckboxItem.Indicator`), adjust the imports/usages here. The rest of the plan is agnostic to those details.

- [ ] **Step 7.3: Verify TypeScript compiles**

```bash
cd frontend && yarn tsc --noEmit
```

Expected: no errors. Fix any type mismatches reported by base-ui (the wrapper is new — fixes should be local to this file).

- [ ] **Step 7.4: Commit**

```bash
cd frontend && git add src/components/ui/menu.tsx && git commit -m "$(cat <<'EOF'
feat(frontend): add Menu ui wrapper over @base-ui/react menu

Thin shadcn-style wrapper exposing Menu, MenuTrigger, MenuContent,
MenuItem, MenuCheckboxItem, MenuSub, MenuSubTrigger, MenuSubContent.
Used by the model/effort chooser submenu.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — rewrite `ModelChooser` with nested submenu

**Files:**
- Modify: `frontend/src/features/chat/ModelChooser.tsx`
- Test: `frontend/src/features/chat/ModelChooser.test.tsx`

- [ ] **Step 8.1: Replace the test file with the new contract**

Overwrite `frontend/src/features/chat/ModelChooser.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelChooser } from "./ModelChooser";
import type { Model } from "../../shared/types/domain";

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

describe("ModelChooser", () => {
  it("shows the model label and effort in the trigger", () => {
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-sonnet-4-6", effort: "high" }}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("high");
  });

  it("fires onChange with {model, effort} when a leaf is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-opus-4-6", effort: "medium" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("model-chooser"));
    await user.click(screen.getByRole("menuitem", { name: /Sonnet 4\.6/i }));
    // Submenu opens; pick "max"
    await user.click(screen.getByRole("menuitemcheckbox", { name: /max/i }));

    expect(onChange).toHaveBeenCalledWith({
      model: "claude-sonnet-4-6",
      effort: "max",
    });
  });

  it("disables the trigger when disabled prop is set", () => {
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-opus-4-6", effort: "medium" }}
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });

  it("renders a check indicator only on the currently selected leaf", async () => {
    const user = userEvent.setup();
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-haiku-4-5", effort: "low" }}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId("model-chooser"));
    await user.click(screen.getByRole("menuitem", { name: /Haiku 4\.5/i }));

    const lowItem = screen.getByRole("menuitemcheckbox", { name: /low/i });
    const maxItem = screen.getByRole("menuitemcheckbox", { name: /max/i });
    expect(lowItem).toHaveAttribute("aria-checked", "true");
    expect(maxItem).toHaveAttribute("aria-checked", "false");
  });
});
```

- [ ] **Step 8.2: Run the tests and confirm they fail**

```bash
cd frontend && yarn test src/features/chat/ModelChooser.test.tsx --run
```

Expected: FAIL — `value={{model, effort}}` does not match the old prop shape; the old component still uses `Select`.

- [ ] **Step 8.3: Rewrite `ModelChooser.tsx`**

Overwrite `frontend/src/features/chat/ModelChooser.tsx`:

```tsx
import type { Model } from "../../shared/types/domain";
import { EFFORTS, type Effort } from "./useModels";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
} from "@/components/ui/menu";
import { ChevronDownIcon } from "lucide-react";

export interface ModelSelection {
  model: string;
  effort: Effort;
}

interface ModelChooserProps {
  models: Model[];
  value: ModelSelection;
  onChange: (next: ModelSelection) => void;
  disabled?: boolean;
}

export function ModelChooser({
  models,
  value,
  onChange,
  disabled,
}: ModelChooserProps) {
  const selectedLabel =
    models.find((m) => m.id === value.model)?.label ?? value.model;

  return (
    <Menu>
      <MenuTrigger
        data-testid="model-chooser"
        aria-label="Model"
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-card bg-bg-page px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedLabel}</span>
        <span className="text-text-muted">·</span>
        <span>{value.effort}</span>
        <ChevronDownIcon className="size-4 text-text-muted" />
      </MenuTrigger>
      <MenuContent>
        {models.map((m) => (
          <MenuSub key={m.id}>
            <MenuSubTrigger>{m.label}</MenuSubTrigger>
            <MenuSubContent>
              {EFFORTS.map((e) => (
                <MenuCheckboxItem
                  key={e}
                  checked={m.id === value.model && e === value.effort}
                  onCheckedChange={(checked) => {
                    if (checked) onChange({ model: m.id, effort: e });
                  }}
                >
                  {e}
                </MenuCheckboxItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        ))}
      </MenuContent>
    </Menu>
  );
}
```

- [ ] **Step 8.4: Run the tests and confirm they pass**

```bash
cd frontend && yarn test src/features/chat/ModelChooser.test.tsx --run
```

Expected: PASS.

If any test fails because the base-ui Menu uses different `role` attributes than `menuitem`/`menuitemcheckbox`, adjust **the test queries** (not the component) to match whatever roles base-ui emits. Start by printing the DOM with `screen.debug()`.

- [ ] **Step 8.5: Commit**

```bash
cd frontend && git add src/features/chat/ModelChooser.tsx src/features/chat/ModelChooser.test.tsx && git commit -m "$(cat <<'EOF'
feat(frontend): rewrite ModelChooser with nested model→effort submenu

Trigger displays "Model · effort". Each model row is a SubTrigger
revealing the four effort options as CheckboxItems; clicking a leaf
fires onChange({model, effort}). Accessible checkmark on the selected
pair only.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — `ChatPanel` adopts combined selection state + migration

**Files:**
- Modify: `frontend/src/features/chat/ChatPanel.tsx`
- Test: `frontend/src/features/chat/ChatPanel.test.tsx`

- [ ] **Step 9.1: Write the failing tests**

Update `frontend/src/features/chat/ChatPanel.test.tsx`. Find the existing `initialSelectedModel` / `onSend` tests by grepping for `LAST_MODEL_KEY` and `onSend`, and rewrite them to the new contract. Add these new tests (keep or adapt existing ones as needed):

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type { Model } from "../../shared/types/domain";
import { initialChatStreamState } from "./chatStream";

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const EMPTY_STREAM = initialChatStreamState;

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  const onSend = vi.fn();
  render(
    <ChatPanel
      userMessages={[]}
      chatStream={EMPTY_STREAM}
      models={MODELS}
      cardModel=""
      cardEffort=""
      onSend={onSend}
      {...overrides}
    />,
  );
  return { onSend };
}

describe("ChatPanel selection init priority", () => {
  it("uses cardModel + cardEffort when both non-empty", () => {
    renderPanel({ cardModel: "claude-sonnet-4-6", cardEffort: "high" });
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("high");
  });

  it("falls through to localStorage when cardEffort is empty", () => {
    window.localStorage.setItem(
      "agentDesk.lastSelection",
      JSON.stringify({ model: "claude-haiku-4-5", effort: "low" }),
    );
    renderPanel({ cardModel: "claude-sonnet-4-6", cardEffort: "" });
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Haiku 4.5");
    expect(trigger).toHaveTextContent("low");
  });

  it("migrates legacy lastModel key with medium default", () => {
    window.localStorage.setItem("agentDesk.lastModel", "claude-sonnet-4-6");
    renderPanel();
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("medium");
  });

  it("defaults to Opus 4.6 · medium when no prior", () => {
    renderPanel();
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Opus 4.6");
    expect(trigger).toHaveTextContent("medium");
  });
});

describe("ChatPanel send flow", () => {
  it("calls onSend(content, model, effort) and writes lastSelection", async () => {
    const user = userEvent.setup();
    const { onSend } = renderPanel({
      cardModel: "claude-haiku-4-5",
      cardEffort: "low",
    });

    await user.type(screen.getByLabelText("Message input"), "hi");
    await user.click(screen.getByTestId("send-button"));

    expect(onSend).toHaveBeenCalledWith("hi", "claude-haiku-4-5", "low");
    expect(window.localStorage.getItem("agentDesk.lastSelection")).toBe(
      JSON.stringify({ model: "claude-haiku-4-5", effort: "low" }),
    );
  });

  it("disables chooser while turnInFlight", () => {
    renderPanel({ chatStream: { ...EMPTY_STREAM, turnInFlight: true } });
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });
});

describe("ChatPanel card_update resync", () => {
  it("updates selection when cardModel or cardEffort changes", () => {
    const { rerender } = render(
      <ChatPanel
        userMessages={[]}
        chatStream={EMPTY_STREAM}
        models={MODELS}
        cardModel="claude-opus-4-6"
        cardEffort="medium"
        onSend={() => {}}
      />,
    );
    expect(screen.getByTestId("model-chooser")).toHaveTextContent("medium");

    rerender(
      <ChatPanel
        userMessages={[]}
        chatStream={EMPTY_STREAM}
        models={MODELS}
        cardModel="claude-opus-4-6"
        cardEffort="max"
        onSend={() => {}}
      />,
    );
    expect(screen.getByTestId("model-chooser")).toHaveTextContent("max");
  });
});
```

- [ ] **Step 9.2: Run the tests and confirm they fail**

```bash
cd frontend && yarn test src/features/chat/ChatPanel.test.tsx --run
```

Expected: FAIL — `ChatPanel` has no `cardEffort` prop; `onSend` signature is still 2-arg.

- [ ] **Step 9.3: Rewrite the relevant parts of `ChatPanel.tsx`**

Apply these changes to `frontend/src/features/chat/ChatPanel.tsx`:

Replace the constants and `initialSelectedModel`:

```tsx
import type { Effort } from "./useModels";
import type { ModelSelection } from "./ModelChooser";

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_EFFORT: Effort = "medium";
const LAST_SELECTION_KEY = "agentDesk.lastSelection";
const LEGACY_LAST_MODEL_KEY = "agentDesk.lastModel";

function initialSelection(
  cardModel: string,
  cardEffort: string,
  models: Model[],
): ModelSelection {
  // Priority 1: both card fields set
  if (cardModel && cardEffort && isValidEffort(cardEffort)) {
    return { model: cardModel, effort: cardEffort };
  }
  // Priority 2: new localStorage key
  try {
    const stored = window.localStorage.getItem(LAST_SELECTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ModelSelection>;
      if (
        parsed &&
        typeof parsed.model === "string" &&
        models.some((m) => m.id === parsed.model) &&
        typeof parsed.effort === "string" &&
        isValidEffort(parsed.effort)
      ) {
        return { model: parsed.model, effort: parsed.effort };
      }
    }
  } catch {
    /* ignore */
  }
  // Priority 3: legacy migration
  try {
    const legacy = window.localStorage.getItem(LEGACY_LAST_MODEL_KEY);
    if (legacy && models.some((m) => m.id === legacy)) {
      return { model: legacy, effort: DEFAULT_EFFORT };
    }
  } catch {
    /* ignore */
  }
  // Priority 4: hard default
  return { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT };
}

function isValidEffort(e: string): e is Effort {
  return e === "low" || e === "medium" || e === "high" || e === "max";
}
```

Update `ChatPanelProps`:

```tsx
interface ChatPanelProps {
  userMessages: Message[];
  chatStream: ChatStreamState;
  onSend: (content: string, model: string, effort: string) => void;
  models: Model[];
  cardModel: string;
  cardEffort: string;
  readOnly?: boolean;
}
```

Replace the `selectedModel` state with `selection`:

```tsx
  const [selection, setSelection] = useState<ModelSelection>(() =>
    initialSelection(cardModel, cardEffort, models),
  );
```

Replace the `cardModel` resync effect with one that resyncs both fields:

```tsx
  useEffect(() => {
    if (cardModel && cardEffort && isValidEffort(cardEffort)) {
      setSelection((current) =>
        current.model === cardModel && current.effort === cardEffort
          ? current
          : { model: cardModel, effort: cardEffort },
      );
    }
  }, [cardModel, cardEffort]);
```

Rewrite `handleSubmit`:

```tsx
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    onSend(trimmed, selection.model, selection.effort);
    try {
      window.localStorage.setItem(
        LAST_SELECTION_KEY,
        JSON.stringify(selection),
      );
      window.localStorage.removeItem(LEGACY_LAST_MODEL_KEY);
    } catch {
      /* ignore */
    }
    setInput("");
  }
```

Update the `ModelChooser` JSX invocation:

```tsx
            <ModelChooser
              models={models}
              value={selection}
              onChange={setSelection}
              disabled={readOnly || chatStream.turnInFlight}
            />
```

- [ ] **Step 9.4: Run the ChatPanel tests and confirm they pass**

```bash
cd frontend && yarn test src/features/chat/ChatPanel.test.tsx --run
```

Expected: PASS.

- [ ] **Step 9.5: Run the full chat test suite**

```bash
cd frontend && yarn test src/features/chat --run
```

Expected: all PASS.

- [ ] **Step 9.6: Commit**

```bash
cd frontend && git add src/features/chat/ChatPanel.tsx src/features/chat/ChatPanel.test.tsx && git commit -m "$(cat <<'EOF'
feat(frontend): ChatPanel tracks combined {model, effort} selection

Init priority is card pair → new lastSelection key → legacy lastModel
migration (medium default) → Opus 4.6 · medium. onSend now carries
(content, model, effort); send writes lastSelection and removes the
legacy key. Chooser disables while a turn is in flight.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend — `useCardSocket` + `CardModal` + `App` plumbing

**Files:**
- Modify: `frontend/src/shared/api/useCardSocket.ts`
- Test: `frontend/src/shared/api/useCardSocket.test.ts`
- Modify: `frontend/src/features/card/CardModal.tsx`
- Test: `frontend/src/features/card/CardModal.test.tsx`
- Modify (grep + adjust): any component that passes `onSend` to `CardModal` / `ChatPanel`

- [ ] **Step 10.1: Extend `useCardSocket.test.ts`**

Append to `frontend/src/shared/api/useCardSocket.test.ts`. Find the existing test that asserts the WS frame shape when `sendMessage` is called with a `model` (grep `"model"` in that file) and mirror the pattern:

```ts
it("sendMessage stamps model and effort onto the message frame", async () => {
  const ws = mockWebSocket();
  const { result } = renderHook(() => useCardSocket("card-1"));

  await act(async () => {
    await ws.waitOpen();
  });

  act(() => {
    result.current.sendMessage("hi", "claude-sonnet-4-6", "high");
  });

  expect(ws.lastSentPayload()).toEqual({
    type: "message",
    content: "hi",
    model: "claude-sonnet-4-6",
    effort: "high",
  });
});

it("sendMessage omits effort when undefined", async () => {
  const ws = mockWebSocket();
  const { result } = renderHook(() => useCardSocket("card-1"));
  await act(async () => {
    await ws.waitOpen();
  });

  act(() => {
    result.current.sendMessage("hi", "claude-sonnet-4-6");
  });

  const payload = ws.lastSentPayload();
  expect(payload).toMatchObject({ type: "message", content: "hi", model: "claude-sonnet-4-6" });
  expect("effort" in payload).toBe(false);
});
```

Use whatever helpers (`mockWebSocket`, `lastSentPayload`) already exist in that test file — do not invent new ones.

- [ ] **Step 10.2: Run the new tests and confirm they fail**

```bash
cd frontend && yarn test src/shared/api/useCardSocket.test.ts --run
```

Expected: FAIL — `sendMessage` takes `(content, model?)`, not `(content, model?, effort?)`.

- [ ] **Step 10.3: Extend `sendMessage`**

In `frontend/src/shared/api/useCardSocket.ts`:

```ts
export interface UseCardSocketResult {
  userMessages: Message[];
  chatStream: ChatStreamState;
  sendMessage: (content: string, model?: string, effort?: string) => void;
  sendAction: (type: "start" | "approve" | "merge") => void;
  cardUpdates: Partial<Card>;
  currentColumn: CardColumn | null;
  prUrl: string | null;
  worktreePath: string | null;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
}
```

And replace the `sendMessage` callback:

```ts
  const sendMessage = useCallback(
    (content: string, model?: string, effort?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const base: { type: "message"; content: string; model?: string; effort?: string } = {
        type: "message",
        content,
      };
      if (model && model.length > 0) base.model = model;
      if (effort && effort.length > 0) base.effort = effort;
      const msg: WSClientMessage = base;
      wsRef.current.send(JSON.stringify(msg));
      setUserMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ]);
    },
    [],
  );
```

- [ ] **Step 10.4: Run the useCardSocket tests and confirm they pass**

```bash
cd frontend && yarn test src/shared/api/useCardSocket.test.ts --run
```

Expected: PASS.

- [ ] **Step 10.5: Update `CardModal.tsx`**

Change the `onSend` prop signature and pass through `cardEffort`:

```tsx
interface CardModalProps {
  card: Card;
  projectTitle?: string;
  userMessages: Message[];
  chatStream: ChatStreamState;
  models: Model[];
  onSend: (content: string, model: string, effort: string) => void;
  onApprove: () => void;
  onMerge: () => void;
  onClose: () => void;
}
```

Inside the JSX update the `ChatPanel` render:

```tsx
            <ChatPanel
              userMessages={userMessages}
              chatStream={chatStream}
              onSend={onSend}
              models={models}
              cardModel={card.model}
              cardEffort={card.effort}
              readOnly={card.column === "done"}
            />
```

- [ ] **Step 10.6: Update `CardModal.test.tsx`**

Find the existing `onSend` mock in the test file. Update the mock's call assertion (if any) to expect `(content, model, effort)`. Add `card.effort: ""` or a value wherever `Card` literals are constructed in the test. Add a smoke test:

```tsx
it("renders the chooser with effort inside the modal", () => {
  render(
    <CardModal
      card={{ ...testCard, model: "claude-sonnet-4-6", effort: "high" }}
      userMessages={[]}
      chatStream={initialChatStreamState}
      models={MODELS}
      onSend={() => {}}
      onApprove={() => {}}
      onMerge={() => {}}
      onClose={() => {}}
    />,
  );
  const trigger = screen.getByTestId("model-chooser");
  expect(trigger).toHaveTextContent("Sonnet 4.6");
  expect(trigger).toHaveTextContent("high");
});
```

Use whatever `testCard` / `MODELS` fixtures the existing file already has; if they don't exist, reuse the `MODELS` array from Task 8 verbatim and construct a minimal `testCard` locally.

- [ ] **Step 10.7: Update all upstream callers of `CardModal` / `ChatPanel.onSend`**

Find them:

```bash
cd frontend && grep -rn "onSend=\|sendMessage(" src/
```

For each caller that previously passed a `(content: string, model: string) => void` handler, update to `(content: string, model: string, effort: string) => void` and forward `effort` into `sendMessage(content, model, effort)`. Likely locations: `App.tsx`, `features/project/ProjectsPage.tsx`.

Also update any `Card` literals in those files' tests to include `effort: ""`.

- [ ] **Step 10.8: Run the full frontend test suite**

```bash
cd frontend && yarn test --run
```

Expected: all PASS.

- [ ] **Step 10.9: Run typecheck, build, and lint**

```bash
cd frontend && yarn tsc --noEmit && yarn build && yarn lint
```

Expected: all clean.

- [ ] **Step 10.10: Commit**

```bash
cd frontend && git add src/shared/api/useCardSocket.ts src/shared/api/useCardSocket.test.ts src/features/card/CardModal.tsx src/features/card/CardModal.test.tsx src/App.tsx src/features/project/ProjectsPage.tsx src/features/project/ProjectsPage.test.tsx && git commit -m "$(cat <<'EOF'
feat(frontend): plumb thinking effort through useCardSocket and CardModal

sendMessage now stamps an optional effort field onto the WS message
frame. CardModal forwards card.effort to ChatPanel and accepts the
3-arg onSend signature. Upstream callers updated.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Manual verification

- [ ] **Step 11.1: Start the backend and frontend dev servers**

```bash
cd backend && go run ./cmd/server &
cd frontend && yarn dev
```

- [ ] **Step 11.2: Round-trip an effort pick**

1. Open a card in the UI.
2. Open the model chooser; hover **Sonnet 4.6**; click **high**.
3. Send a short message (e.g. "hi").
4. In a separate terminal: `ps -o pid,command | grep 'claude --'` — confirm the spawned process argv contains `--model claude-sonnet-4-6 --effort high`.
5. Close the card and reopen — the trigger should still read `Sonnet 4.6 · high` (server-persisted).
6. Create a **new** card — the trigger should default to `Sonnet 4.6 · high` (localStorage-sticky).
7. Open a second browser tab pointing at the first card; in tab 1 change the effort to `max` via sending a new message; tab 2's trigger should update via the `card_update` broadcast.

- [ ] **Step 11.3: Try an invalid value (sanity check)**

Open devtools → Network → WS → send a frame manually:
`{"type":"message","content":"hi","model":"claude-opus-4-6","effort":"ultra"}`.
Confirm an `{type:"error", message:"unknown effort: ultra"}` frame comes back and no Claude process was spawned.

- [ ] **Step 11.4: Completion checklist**

- [ ] `cd frontend && yarn test` — all pass
- [ ] `cd backend && go test ./...` — all pass
- [ ] `cd frontend && yarn build` — clean
- [ ] `cd backend && go build ./...` — clean
- [ ] `cd frontend && yarn lint` — clean
- [ ] Manual round trip above
- [ ] All commits descriptive, one per TDD slice
