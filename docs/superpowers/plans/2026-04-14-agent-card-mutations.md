# Agent Card Mutations via MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nested Claude Code CLI agent mutates its own card's state (status, title, description, summary, progress, labels, blocked reason, acceptance criteria, relevant files, complexity) via a session-scoped HTTP MCP server on the backend.

**Architecture:** Backend exposes `/mcp` endpoint using `github.com/mark3labs/mcp-go` over streamable HTTP. `agent.Manager.Send` mints a short-lived session token mapping `token → cardId`, writes a temp `.mcp.json` config pointing at `http://127.0.0.1:8080/mcp?token=<t>`, and passes `--mcp-config <path>` + `--allowed-tools "mcp__agent_desk__*"` to the Claude CLI. Tool handlers call `card.Service` in-process; existing `broadcastCard` streams updates to the frontend over WebSocket. Five new Card fields (`Labels`, `Summary`, `BlockedReason`, `Progress`, `UpdatedAt`) render in `CardContent` + `KanbanCard`.

**Tech Stack:** Go 1.25, `github.com/mark3labs/mcp-go` v0.38+, React + TypeScript, Vitest, stdlib `net/http`, `nhooyr.io/websocket`.

**Reference spec:** `docs/superpowers/specs/2026-04-14-agent-card-mutations-design.md`

---

## Phase layout + parallel execution

Five lanes, partially overlapping:

- **Lane A (backend data + service)** — Tasks 1–4. Unblocks Lane B.
- **Lane B (backend MCP)** — Tasks 5–11. Depends on Lane A. Unblocks Lane C.
- **Lane C (backend wiring)** — Tasks 12–14. Depends on Lane B.
- **Lane D (frontend types + card UI)** — Tasks 15–18. Runs parallel to A/B/C (optional fields default to empty/null).
- **Lane E (frontend board + chat)** — Tasks 19–21. Runs parallel to A/B/C.
- **Lane F (final verification)** — Task 22. After all lanes green.

Subagent dispatch order: `[A, D, E]` together → `B` after `A` → `C` after `B` → `F` after all.

---

## Lane A — Backend data model + service

### Task 1: Add new fields to Card struct

**Files:**
- Modify: `backend/internal/card/card.go`
- Modify: `backend/internal/card/store.go` (lines 26-41 — `Create`)

- [ ] **Step 1: Extend Card struct + add Progress type**

Replace `backend/internal/card/card.go` with:

```go
package card

type Column string

const (
	ColumnBacklog    Column = "backlog"
	ColumnInProgress Column = "in_progress"
	ColumnReview     Column = "review"
	ColumnDone       Column = "done"
)

type Progress struct {
	Step        int    `json:"step"`
	TotalSteps  int    `json:"totalSteps"`
	CurrentStep string `json:"currentStep"`
}

type Card struct {
	ID                 string    `json:"id"`
	ProjectID          string    `json:"projectId"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	Column             Column    `json:"column"`
	AcceptanceCriteria []string  `json:"acceptanceCriteria"`
	Complexity         string    `json:"complexity"`
	RelevantFiles      []string  `json:"relevantFiles"`
	Labels             []string  `json:"labels"`
	Summary            string    `json:"summary"`
	BlockedReason      string    `json:"blockedReason"`
	Progress           *Progress `json:"progress,omitempty"`
	Model              string    `json:"model"`
	Effort             string    `json:"effort"`
	SessionID          string    `json:"sessionId"`
	WorktreePath       string    `json:"worktreePath"`
	BranchName         string    `json:"branchName"`
	PRUrl              string    `json:"prUrl"`
	CreatedAt          int64     `json:"createdAt"`
	UpdatedAt          int64     `json:"updatedAt"`
}
```

- [ ] **Step 2: Initialize Labels + UpdatedAt in Store.Create**

In `backend/internal/card/store.go`, replace the `Create` body (lines 26-41) so `Labels` defaults to a non-nil empty slice and `UpdatedAt` starts equal to `CreatedAt`:

```go
func (s *Store) Create(projectID, title string) Card {
	id := newID()
	now := time.Now().Unix()
	c := Card{
		ID:                 id,
		ProjectID:          projectID,
		Title:              title,
		Column:             ColumnBacklog,
		AcceptanceCriteria: []string{},
		RelevantFiles:      []string{},
		Labels:             []string{},
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	s.mu.Lock()
	s.cards[id] = c
	s.mu.Unlock()
	return c
}
```

- [ ] **Step 3: Preserve UpdatedAt on Store.Update**

Wait — we actually want `Update` to accept the caller's `UpdatedAt` (service stamps it before calling). Current `Update` (store.go:94) preserves `CreatedAt` from the existing record; leave that. Do NOT touch `UpdatedAt` — service owns it.

- [ ] **Step 4: Run existing tests — all still pass**

```bash
cd backend && go test ./internal/card/...
```

Expected: PASS. New fields are zero-valued on existing test cards; no behavioral change.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/card.go backend/internal/card/store.go
git commit -m "feat(card): add Labels, Summary, BlockedReason, Progress, UpdatedAt fields"
```

---

### Task 2: Add service setters for new fields (TDD)

**Files:**
- Modify: `backend/internal/card/service.go`
- Modify: `backend/internal/card/service_test.go`

- [ ] **Step 1: Write failing tests for SetSummary + SetBlocked + ClearBlocked**

Append to `backend/internal/card/service_test.go`:

```go
// --- Summary / Blocked / Progress / Labels ---

func TestSetSummary_HappyPath_StampsUpdatedAt(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	before := c.UpdatedAt
	time.Sleep(1100 * time.Millisecond)

	updated, err := svc.SetSummary(c.ID, "refactoring auth")
	if err != nil {
		t.Fatalf("SetSummary: %v", err)
	}
	if updated.Summary != "refactoring auth" {
		t.Fatalf("summary = %q, want 'refactoring auth'", updated.Summary)
	}
	if updated.UpdatedAt <= before {
		t.Fatalf("UpdatedAt not advanced: before=%d after=%d", before, updated.UpdatedAt)
	}
}

func TestSetSummary_TooLong_Rejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	long := strings.Repeat("a", 281)
	_, err := svc.SetSummary(c.ID, long)
	if err == nil {
		t.Fatal("expected error for summary > 280 chars")
	}
}

func TestSetSummary_Empty_Clears(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.SetSummary(c.ID, "temp")
	updated, err := svc.SetSummary(c.ID, "")
	if err != nil {
		t.Fatalf("SetSummary empty: %v", err)
	}
	if updated.Summary != "" {
		t.Fatalf("summary = %q, want empty", updated.Summary)
	}
}

func TestSetBlocked_NonEmpty(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	updated, err := svc.SetBlocked(c.ID, "waiting on DB creds")
	if err != nil {
		t.Fatalf("SetBlocked: %v", err)
	}
	if updated.BlockedReason != "waiting on DB creds" {
		t.Fatalf("reason = %q", updated.BlockedReason)
	}
}

func TestSetBlocked_EmptyRejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetBlocked(c.ID, "")
	if err == nil {
		t.Fatal("expected error for empty reason")
	}
}

func TestClearBlocked(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.SetBlocked(c.ID, "stuck")
	updated, err := svc.ClearBlocked(c.ID)
	if err != nil {
		t.Fatalf("ClearBlocked: %v", err)
	}
	if updated.BlockedReason != "" {
		t.Fatalf("reason = %q, want empty", updated.BlockedReason)
	}
}
```

Add to imports at top of `service_test.go`: `"time"`.

- [ ] **Step 2: Run — expect compile fail**

```bash
cd backend && go test ./internal/card/ -run TestSetSummary
```

Expected: FAIL — `svc.SetSummary undefined`, `svc.SetBlocked undefined`, `svc.ClearBlocked undefined`.

- [ ] **Step 3: Add helper + setters in service.go**

In `backend/internal/card/service.go`, add `"time"` to imports, then append:

```go
// touch stamps UpdatedAt to now (ms-ish via Unix seconds) and persists c.
// Must be called from every mutation path.
func (s *Service) touch(c *Card) {
	c.UpdatedAt = time.Now().Unix()
	s.store.Update(*c)
}

// SetSummary sets a short one-line status. Empty string clears. Max 280 chars.
func (s *Service) SetSummary(id, summary string) (Card, error) {
	if len(summary) > 280 {
		return Card{}, fmt.Errorf("summary exceeds 280 chars (got %d)", len(summary))
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.Summary = summary
	s.touch(&c)
	return c, nil
}

// SetBlocked marks the card as blocked with a non-empty reason.
func (s *Service) SetBlocked(id, reason string) (Card, error) {
	if reason == "" {
		return Card{}, fmt.Errorf("blocked reason must not be empty")
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.BlockedReason = reason
	s.touch(&c)
	return c, nil
}

// ClearBlocked unmarks the card as blocked.
func (s *Service) ClearBlocked(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.BlockedReason = ""
	s.touch(&c)
	return c, nil
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && go test ./internal/card/ -run "TestSetSummary|TestSetBlocked|TestClearBlocked" -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/service.go backend/internal/card/service_test.go
git commit -m "feat(card): add SetSummary, SetBlocked, ClearBlocked with UpdatedAt stamping"
```

---

### Task 3: SetProgress, ClearProgress, AddLabel, RemoveLabel (TDD)

**Files:**
- Modify: `backend/internal/card/service.go`
- Modify: `backend/internal/card/service_test.go`

- [ ] **Step 1: Write failing tests**

Append to `service_test.go`:

```go
func TestSetProgress_HappyPath(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	updated, err := svc.SetProgress(c.ID, 2, 5, "writing tests")
	if err != nil {
		t.Fatalf("SetProgress: %v", err)
	}
	if updated.Progress == nil {
		t.Fatal("expected non-nil Progress")
	}
	if updated.Progress.Step != 2 || updated.Progress.TotalSteps != 5 {
		t.Fatalf("got step=%d total=%d", updated.Progress.Step, updated.Progress.TotalSteps)
	}
	if updated.Progress.CurrentStep != "writing tests" {
		t.Fatalf("currentStep = %q", updated.Progress.CurrentStep)
	}
}

func TestSetProgress_StepBeyondTotal_Rejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetProgress(c.ID, 6, 5, "oops")
	if err == nil {
		t.Fatal("expected error when step > totalSteps")
	}
}

func TestSetProgress_ZeroTotal_Rejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetProgress(c.ID, 0, 0, "x")
	if err == nil {
		t.Fatal("expected error when totalSteps < 1")
	}
}

func TestSetProgress_NegativeStep_Rejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetProgress(c.ID, -1, 3, "x")
	if err == nil {
		t.Fatal("expected error for negative step")
	}
}

func TestClearProgress(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.SetProgress(c.ID, 1, 2, "x")
	updated, err := svc.ClearProgress(c.ID)
	if err != nil {
		t.Fatalf("ClearProgress: %v", err)
	}
	if updated.Progress != nil {
		t.Fatalf("expected nil Progress, got %+v", updated.Progress)
	}
}

func TestAddLabel_TrimsAndDedupes(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.AddLabel(c.ID, "  bug  ")
	updated, err := svc.AddLabel(c.ID, "bug")
	if err != nil {
		t.Fatalf("AddLabel: %v", err)
	}
	if len(updated.Labels) != 1 || updated.Labels[0] != "bug" {
		t.Fatalf("labels = %v, want [bug]", updated.Labels)
	}
}

func TestAddLabel_EmptyRejected(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.AddLabel(c.ID, "  ")
	if err == nil {
		t.Fatal("expected error for empty label")
	}
}

func TestRemoveLabel(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.AddLabel(c.ID, "bug")
	svc.AddLabel(c.ID, "urgent")
	updated, err := svc.RemoveLabel(c.ID, "bug")
	if err != nil {
		t.Fatalf("RemoveLabel: %v", err)
	}
	if len(updated.Labels) != 1 || updated.Labels[0] != "urgent" {
		t.Fatalf("labels = %v, want [urgent]", updated.Labels)
	}
}

func TestRemoveLabel_Missing_NoError(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.RemoveLabel(c.ID, "ghost")
	if err != nil {
		t.Fatalf("RemoveLabel on missing label should be no-op, got: %v", err)
	}
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/card/ -run "TestSetProgress|TestClearProgress|TestAddLabel|TestRemoveLabel"
```

Expected: FAIL — undefined methods.

- [ ] **Step 3: Implement**

Append to `backend/internal/card/service.go`, adding `"strings"` to imports:

```go
// SetProgress updates the card's progress snapshot. Enforces:
//   - totalSteps >= 1
//   - 0 <= step <= totalSteps
func (s *Service) SetProgress(id string, step, totalSteps int, currentStep string) (Card, error) {
	if totalSteps < 1 {
		return Card{}, fmt.Errorf("totalSteps must be >= 1, got %d", totalSteps)
	}
	if step < 0 {
		return Card{}, fmt.Errorf("step must be >= 0, got %d", step)
	}
	if step > totalSteps {
		return Card{}, fmt.Errorf("step (%d) must be <= totalSteps (%d)", step, totalSteps)
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.Progress = &Progress{Step: step, TotalSteps: totalSteps, CurrentStep: currentStep}
	s.touch(&c)
	return c, nil
}

// ClearProgress sets Progress to nil.
func (s *Service) ClearProgress(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.Progress = nil
	s.touch(&c)
	return c, nil
}

// AddLabel trims + dedupes a label onto the card.
func (s *Service) AddLabel(id, label string) (Card, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return Card{}, fmt.Errorf("label must not be empty")
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	for _, existing := range c.Labels {
		if existing == label {
			s.touch(&c)
			return c, nil
		}
	}
	c.Labels = append(c.Labels, label)
	s.touch(&c)
	return c, nil
}

// RemoveLabel removes a label if present. No-op if absent.
func (s *Service) RemoveLabel(id, label string) (Card, error) {
	label = strings.TrimSpace(label)
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	filtered := c.Labels[:0]
	for _, existing := range c.Labels {
		if existing != label {
			filtered = append(filtered, existing)
		}
	}
	c.Labels = filtered
	s.touch(&c)
	return c, nil
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && go test ./internal/card/ -run "TestSetProgress|TestClearProgress|TestAddLabel|TestRemoveLabel" -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/service.go backend/internal/card/service_test.go
git commit -m "feat(card): add SetProgress, ClearProgress, AddLabel, RemoveLabel"
```

---

### Task 4: UpdateFields extends whitelist + stamps UpdatedAt + AC mutations + SetColumn dispatcher (TDD)

**Files:**
- Modify: `backend/internal/card/service.go`
- Modify: `backend/internal/card/service_test.go`

- [ ] **Step 1: Write failing tests**

Append to `service_test.go`:

```go
func TestUpdateFields_StampsUpdatedAt(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	before := c.UpdatedAt
	time.Sleep(1100 * time.Millisecond)
	updated, err := svc.UpdateFields(c.ID, map[string]any{"title": "new"})
	if err != nil {
		t.Fatalf("UpdateFields: %v", err)
	}
	if updated.UpdatedAt <= before {
		t.Fatalf("UpdatedAt not advanced")
	}
}

func TestUpdateFields_LabelsWhitelisted(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	updated, err := svc.UpdateFields(c.ID, map[string]any{
		"labels": []string{"bug", "urgent"},
	})
	if err != nil {
		t.Fatalf("UpdateFields: %v", err)
	}
	if len(updated.Labels) != 2 {
		t.Fatalf("labels = %v, want 2", updated.Labels)
	}
}

func TestAddAcceptanceCriterion(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	updated, err := svc.AddAcceptanceCriterion(c.ID, "passes lint")
	if err != nil {
		t.Fatalf("AddAC: %v", err)
	}
	if len(updated.AcceptanceCriteria) != 1 || updated.AcceptanceCriteria[0] != "passes lint" {
		t.Fatalf("AC = %v", updated.AcceptanceCriteria)
	}
}

func TestRemoveAcceptanceCriterion(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.AddAcceptanceCriterion(c.ID, "a")
	svc.AddAcceptanceCriterion(c.ID, "b")
	svc.AddAcceptanceCriterion(c.ID, "c")
	updated, err := svc.RemoveAcceptanceCriterion(c.ID, 1)
	if err != nil {
		t.Fatalf("RemoveAC: %v", err)
	}
	if len(updated.AcceptanceCriteria) != 2 || updated.AcceptanceCriteria[0] != "a" || updated.AcceptanceCriteria[1] != "c" {
		t.Fatalf("AC = %v, want [a c]", updated.AcceptanceCriteria)
	}
}

func TestRemoveAcceptanceCriterion_OutOfRange(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.AddAcceptanceCriterion(c.ID, "only")
	_, err := svc.RemoveAcceptanceCriterion(c.ID, 7)
	if err == nil {
		t.Fatal("expected out-of-range error")
	}
}

func TestSetColumn_DispatchesBacklogToInProgress(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	updated, err := svc.SetColumn(c.ID, ColumnInProgress)
	if err != nil {
		t.Fatalf("SetColumn: %v", err)
	}
	if updated.Column != ColumnInProgress {
		t.Fatalf("column = %q", updated.Column)
	}
}

func TestSetColumn_InProgressToReview(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.StartDevelopment(c.ID)
	updated, err := svc.SetColumn(c.ID, ColumnReview)
	if err != nil {
		t.Fatalf("SetColumn: %v", err)
	}
	if updated.Column != ColumnReview {
		t.Fatalf("column = %q", updated.Column)
	}
}

func TestSetColumn_ReviewToInProgress(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	svc.StartDevelopment(c.ID)
	svc.MoveToReview(c.ID)
	updated, err := svc.SetColumn(c.ID, ColumnInProgress)
	if err != nil {
		t.Fatalf("SetColumn: %v", err)
	}
	if updated.Column != ColumnInProgress {
		t.Fatalf("column = %q", updated.Column)
	}
}

func TestSetColumn_IllegalBacklogToDone(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetColumn(c.ID, ColumnDone)
	if err == nil {
		t.Fatal("expected illegal transition error")
	}
}

func TestSetColumn_SameColumnNoop(t *testing.T) {
	svc := newTestService()
	c := svc.CreateCard("p", "x")
	_, err := svc.SetColumn(c.ID, ColumnBacklog)
	if err != nil {
		t.Fatalf("SetColumn same column should be no-op, got: %v", err)
	}
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/card/ -run "TestUpdateFields_StampsUpdatedAt|TestUpdateFields_LabelsWhitelisted|TestAddAcceptanceCriterion|TestRemoveAcceptanceCriterion|TestSetColumn"
```

Expected: FAIL on the newly-named tests.

- [ ] **Step 3: Extend UpdateFields + add AC setters + SetColumn dispatcher**

In `backend/internal/card/service.go`:

Replace `UpdateFields` (currently lines 46-77) with:

```go
// UpdateFields applies a partial update to allowed string and slice fields.
// Stamps UpdatedAt on any successful change.
func (s *Service) UpdateFields(id string, fields map[string]any) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	for k, v := range fields {
		switch k {
		case "title":
			if str, ok := v.(string); ok {
				c.Title = str
			}
		case "description":
			if str, ok := v.(string); ok {
				c.Description = str
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

Append AC mutators:

```go
// AddAcceptanceCriterion appends text to the acceptance-criteria list.
func (s *Service) AddAcceptanceCriterion(id, text string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.AcceptanceCriteria = append(c.AcceptanceCriteria, text)
	s.touch(&c)
	return c, nil
}

// RemoveAcceptanceCriterion removes the AC at the given index.
func (s *Service) RemoveAcceptanceCriterion(id string, index int) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if index < 0 || index >= len(c.AcceptanceCriteria) {
		return Card{}, fmt.Errorf("acceptance criterion index %d out of range [0, %d)", index, len(c.AcceptanceCriteria))
	}
	c.AcceptanceCriteria = append(c.AcceptanceCriteria[:index], c.AcceptanceCriteria[index+1:]...)
	s.touch(&c)
	return c, nil
}

// SetColumn dispatches to the matching state-machine transition.
// Returns an error for illegal transitions. Same-column is a no-op.
func (s *Service) SetColumn(id string, target Column) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column == target {
		return c, nil
	}
	switch {
	case c.Column == ColumnBacklog && target == ColumnInProgress:
		return s.StartDevelopment(id)
	case c.Column == ColumnInProgress && target == ColumnReview:
		return s.MoveToReview(id)
	case c.Column == ColumnReview && target == ColumnInProgress:
		return s.RejectToInProgress(id)
	case c.Column == ColumnReview && target == ColumnDone:
		return s.MoveToDone(id)
	default:
		return Card{}, fmt.Errorf("illegal column transition %q → %q", c.Column, target)
	}
}
```

Also update the existing state-machine transitions (`StartDevelopment`, `MoveToReview`, `RejectToInProgress`, `MoveToDone`, `SetPRUrl`, `SetWorktree`, `SetModel`, `SetEffort`, `SetSessionID`) to call `s.touch(&c)` instead of `s.store.Update(c)`. **Do this for every mutation path** so `UpdatedAt` is stamped everywhere.

Example — replace `StartDevelopment` body's `s.store.Update(c)` with:

```go
	c.Column = ColumnInProgress
	s.touch(&c)
	return c, nil
```

Apply the same substitution for `MoveToReview`, `RejectToInProgress`, `SetPRUrl`, `MoveToDone`, `SetWorktree`, `SetModel`, `SetEffort`, `SetSessionID`.

- [ ] **Step 4: Run all card tests — expect full pass**

```bash
cd backend && go test ./internal/card/... -v
```

Expected: PASS. If any old test regresses on `UpdatedAt`, verify the factory in the test matches the new zero-valued field.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/card/service.go backend/internal/card/service_test.go
git commit -m "feat(card): SetColumn dispatcher, AC mutators, UpdateFields labels + UpdatedAt on all mutations"
```

---

## Lane B — Backend MCP server

### Task 5: Add mcp-go dependency

**Files:**
- Modify: `backend/go.mod`, `backend/go.sum`

- [ ] **Step 1: Add dependency**

```bash
cd backend && go get github.com/mark3labs/mcp-go@latest
```

- [ ] **Step 2: Verify download**

```bash
cd backend && go mod tidy && go build ./...
```

Expected: clean build, `go.mod` now lists `github.com/mark3labs/mcp-go`.

- [ ] **Step 3: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "chore(backend): add mark3labs/mcp-go dependency"
```

---

### Task 6: Session token registry (TDD)

**Files:**
- Create: `backend/internal/mcp/session.go`
- Create: `backend/internal/mcp/session_test.go`

- [ ] **Step 1: Write failing test**

Create `backend/internal/mcp/session_test.go`:

```go
package mcp

import (
	"testing"
)

func TestSessions_MintResolvesToCardID(t *testing.T) {
	s := NewSessions()
	tok := s.Mint("card-123")
	if tok == "" {
		t.Fatal("expected non-empty token")
	}
	cardID, ok := s.Resolve(tok)
	if !ok {
		t.Fatal("expected token to resolve")
	}
	if cardID != "card-123" {
		t.Fatalf("cardID = %q, want card-123", cardID)
	}
}

func TestSessions_UnknownTokenFails(t *testing.T) {
	s := NewSessions()
	_, ok := s.Resolve("not-a-real-token")
	if ok {
		t.Fatal("expected unknown token to fail resolution")
	}
}

func TestSessions_Revoke(t *testing.T) {
	s := NewSessions()
	tok := s.Mint("card-x")
	s.Revoke(tok)
	_, ok := s.Resolve(tok)
	if ok {
		t.Fatal("expected revoked token to fail resolution")
	}
}

func TestSessions_MintProducesUniqueTokens(t *testing.T) {
	s := NewSessions()
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		tok := s.Mint("c")
		if seen[tok] {
			t.Fatalf("duplicate token %q on iteration %d", tok, i)
		}
		seen[tok] = true
	}
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/mcp/...
```

Expected: FAIL — package does not exist.

- [ ] **Step 3: Implement**

Create `backend/internal/mcp/session.go`:

```go
package mcp

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// Sessions is a thread-safe in-memory token → cardID registry for scoping
// MCP tool calls to a single card per agent subprocess.
type Sessions struct {
	mu     sync.RWMutex
	byToken map[string]string
}

func NewSessions() *Sessions {
	return &Sessions{byToken: make(map[string]string)}
}

// Mint creates a fresh token bound to cardID and returns it.
func (s *Sessions) Mint(cardID string) string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic("mcp: failed to mint session token: " + err.Error())
	}
	tok := hex.EncodeToString(b)
	s.mu.Lock()
	s.byToken[tok] = cardID
	s.mu.Unlock()
	return tok
}

// Resolve returns the cardID bound to tok and whether it was found.
func (s *Sessions) Resolve(tok string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cardID, ok := s.byToken[tok]
	return cardID, ok
}

// Revoke removes a token, typically when the agent subprocess exits.
func (s *Sessions) Revoke(tok string) {
	s.mu.Lock()
	delete(s.byToken, tok)
	s.mu.Unlock()
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && go test ./internal/mcp/... -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/
git commit -m "feat(mcp): add in-memory session token registry"
```

---

### Task 7: Define CardMutator interface + mock for tool tests

**Files:**
- Create: `backend/internal/mcp/mutator.go`

- [ ] **Step 1: Define interface**

Create `backend/internal/mcp/mutator.go`:

```go
package mcp

import "github.com/jackuait/agent-desk/backend/internal/card"

// CardMutator is the subset of card.Service the MCP tool handlers need.
// Extracted as an interface so tool handler tests can mock without standing up a full store.
type CardMutator interface {
	GetCard(id string) (card.Card, error)
	UpdateFields(id string, fields map[string]any) (card.Card, error)
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

- [ ] **Step 2: Verify `*card.Service` satisfies interface at compile time**

Append to `backend/internal/mcp/mutator.go`:

```go
// Compile-time check that *card.Service satisfies CardMutator.
var _ CardMutator = (*card.Service)(nil)
```

- [ ] **Step 3: Build**

```bash
cd backend && go build ./...
```

Expected: clean build. Any missing method means Lane A is incomplete — fix there, not here.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/mcp/mutator.go
git commit -m "feat(mcp): define CardMutator interface"
```

---

### Task 8: Tool handlers (TDD)

**Files:**
- Create: `backend/internal/mcp/handlers.go`
- Create: `backend/internal/mcp/handlers_test.go`

- [ ] **Step 1: Write failing tests**

Create `backend/internal/mcp/handlers_test.go`:

```go
package mcp

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

// fakeMutator records calls + returns scripted responses.
type fakeMutator struct {
	setColumnCalled struct {
		id     string
		target card.Column
		fired  bool
	}
	setSummaryCalled struct {
		id      string
		summary string
		fired   bool
	}
	getCardResponse card.Card
	getCardErr      error
	setSummaryErr   error
	setColumnErr    error
}

func (f *fakeMutator) GetCard(id string) (card.Card, error) { return f.getCardResponse, f.getCardErr }
func (f *fakeMutator) UpdateFields(id string, fields map[string]any) (card.Card, error) {
	return card.Card{ID: id, Title: fields["title"].(string)}, nil
}
func (f *fakeMutator) SetColumn(id string, target card.Column) (card.Card, error) {
	f.setColumnCalled.id = id
	f.setColumnCalled.target = target
	f.setColumnCalled.fired = true
	return card.Card{ID: id, Column: target}, f.setColumnErr
}
func (f *fakeMutator) SetSummary(id, summary string) (card.Card, error) {
	f.setSummaryCalled.id = id
	f.setSummaryCalled.summary = summary
	f.setSummaryCalled.fired = true
	return card.Card{ID: id, Summary: summary}, f.setSummaryErr
}
func (f *fakeMutator) SetBlocked(id, reason string) (card.Card, error) {
	return card.Card{ID: id, BlockedReason: reason}, nil
}
func (f *fakeMutator) ClearBlocked(id string) (card.Card, error) {
	return card.Card{ID: id}, nil
}
func (f *fakeMutator) SetProgress(id string, step, totalSteps int, currentStep string) (card.Card, error) {
	return card.Card{ID: id, Progress: &card.Progress{Step: step, TotalSteps: totalSteps, CurrentStep: currentStep}}, nil
}
func (f *fakeMutator) ClearProgress(id string) (card.Card, error) { return card.Card{ID: id}, nil }
func (f *fakeMutator) AddLabel(id, label string) (card.Card, error) {
	return card.Card{ID: id, Labels: []string{label}}, nil
}
func (f *fakeMutator) RemoveLabel(id, label string) (card.Card, error) {
	return card.Card{ID: id}, nil
}
func (f *fakeMutator) AddAcceptanceCriterion(id, text string) (card.Card, error) {
	return card.Card{ID: id, AcceptanceCriteria: []string{text}}, nil
}
func (f *fakeMutator) RemoveAcceptanceCriterion(id string, index int) (card.Card, error) {
	return card.Card{ID: id}, nil
}

func TestHandler_SetSummary_InvokesMutator(t *testing.T) {
	m := &fakeMutator{}
	h := NewHandlers(m)
	res, err := h.SetSummary(context.Background(), "card-abc", map[string]any{"summary": "refactoring"})
	if err != nil {
		t.Fatalf("SetSummary: %v", err)
	}
	if !m.setSummaryCalled.fired {
		t.Fatal("expected SetSummary to be called")
	}
	if m.setSummaryCalled.id != "card-abc" {
		t.Fatalf("cardID = %q", m.setSummaryCalled.id)
	}
	if m.setSummaryCalled.summary != "refactoring" {
		t.Fatalf("summary = %q", m.setSummaryCalled.summary)
	}
	if res.IsError {
		t.Fatalf("expected success, got error: %s", res.Message)
	}
}

func TestHandler_SetSummary_MissingArg(t *testing.T) {
	m := &fakeMutator{}
	h := NewHandlers(m)
	res, err := h.SetSummary(context.Background(), "card-abc", map[string]any{})
	if err != nil {
		t.Fatalf("SetSummary: %v", err)
	}
	if !res.IsError {
		t.Fatal("expected IsError for missing summary arg")
	}
	if !strings.Contains(res.Message, "summary") {
		t.Fatalf("expected error to mention summary, got %q", res.Message)
	}
}

func TestHandler_SetStatus_ValidColumn(t *testing.T) {
	m := &fakeMutator{}
	h := NewHandlers(m)
	res, err := h.SetStatus(context.Background(), "card-1", map[string]any{"column": "in_progress"})
	if err != nil {
		t.Fatalf("SetStatus: %v", err)
	}
	if res.IsError {
		t.Fatalf("unexpected error: %s", res.Message)
	}
	if !m.setColumnCalled.fired {
		t.Fatal("expected SetColumn invocation")
	}
	if m.setColumnCalled.target != card.ColumnInProgress {
		t.Fatalf("target = %q", m.setColumnCalled.target)
	}
}

func TestHandler_SetStatus_InvalidColumn(t *testing.T) {
	m := &fakeMutator{}
	h := NewHandlers(m)
	res, err := h.SetStatus(context.Background(), "card-1", map[string]any{"column": "nonsense"})
	if err != nil {
		t.Fatalf("SetStatus: %v", err)
	}
	if !res.IsError {
		t.Fatal("expected IsError for invalid column")
	}
}

func TestHandler_SetStatus_ServiceError_SurfacesAsIsError(t *testing.T) {
	m := &fakeMutator{setColumnErr: errors.New("illegal transition backlog → done")}
	h := NewHandlers(m)
	res, err := h.SetStatus(context.Background(), "card-1", map[string]any{"column": "done"})
	if err != nil {
		t.Fatalf("SetStatus: %v", err)
	}
	if !res.IsError {
		t.Fatal("expected IsError when mutator returns error")
	}
	if !strings.Contains(res.Message, "illegal") {
		t.Fatalf("expected message to include service error, got %q", res.Message)
	}
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/mcp/...
```

Expected: FAIL — `Handlers`, `NewHandlers`, `SetSummary`, `SetStatus` undefined.

- [ ] **Step 3: Implement handlers**

Create `backend/internal/mcp/handlers.go`:

```go
package mcp

import (
	"context"
	"fmt"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

// Result is the minimal output shape of a tool handler, independent of the
// MCP library's CallToolResult type. A thin adapter layer translates Result
// to mcp-go's types in server.go.
type Result struct {
	Message string
	IsError bool
}

func okResult(msg string) Result { return Result{Message: msg} }
func errResult(format string, args ...any) Result {
	return Result{Message: fmt.Sprintf(format, args...), IsError: true}
}

// Handlers holds the CardMutator and exposes one method per MCP tool.
type Handlers struct {
	svc CardMutator
}

func NewHandlers(svc CardMutator) *Handlers {
	return &Handlers{svc: svc}
}

func argString(args map[string]any, key string) (string, bool) {
	v, ok := args[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

func argInt(args map[string]any, key string) (int, bool) {
	v, ok := args[key]
	if !ok {
		return 0, false
	}
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	}
	return 0, false
}

func argStringSlice(args map[string]any, key string) ([]string, bool) {
	v, ok := args[key]
	if !ok {
		return nil, false
	}
	switch sl := v.(type) {
	case []string:
		return sl, true
	case []any:
		out := make([]string, len(sl))
		for i, item := range sl {
			s, ok := item.(string)
			if !ok {
				return nil, false
			}
			out[i] = s
		}
		return out, true
	}
	return nil, false
}

// --- Tool handlers (one per MCP tool). Each takes the scoped cardID
// (resolved from the session token upstream) + the raw tool args.

func (h *Handlers) GetCard(_ context.Context, cardID string, _ map[string]any) (Result, error) {
	c, err := h.svc.GetCard(cardID)
	if err != nil {
		return errResult("%v", err), nil
	}
	return okResult(fmt.Sprintf("%+v", c)), nil
}

func (h *Handlers) SetStatus(_ context.Context, cardID string, args map[string]any) (Result, error) {
	col, ok := argString(args, "column")
	if !ok {
		return errResult("missing required arg 'column'"), nil
	}
	target := card.Column(col)
	switch target {
	case card.ColumnBacklog, card.ColumnInProgress, card.ColumnReview, card.ColumnDone:
	default:
		return errResult("invalid column %q (must be backlog|in_progress|review|done)", col), nil
	}
	if _, err := h.svc.SetColumn(cardID, target); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("status → " + col), nil
}

func (h *Handlers) SetTitle(_ context.Context, cardID string, args map[string]any) (Result, error) {
	title, present := argString(args, "title")
	if !present {
		return errResult("missing required arg 'title'"), nil
	}
	if len(title) > 200 {
		return errResult("title exceeds 200 chars"), nil
	}
	if _, err := h.svc.UpdateFields(cardID, map[string]any{"title": title}); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("title updated"), nil
}

func (h *Handlers) SetDescription(_ context.Context, cardID string, args map[string]any) (Result, error) {
	desc, present := argString(args, "description")
	if !present {
		return errResult("missing required arg 'description'"), nil
	}
	if len(desc) > 8000 {
		return errResult("description exceeds 8000 chars"), nil
	}
	if _, err := h.svc.UpdateFields(cardID, map[string]any{"description": desc}); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("description updated"), nil
}

func (h *Handlers) SetSummary(_ context.Context, cardID string, args map[string]any) (Result, error) {
	summary, present := argString(args, "summary")
	if !present {
		return errResult("missing required arg 'summary'"), nil
	}
	if _, err := h.svc.SetSummary(cardID, summary); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("summary updated"), nil
}

func (h *Handlers) SetComplexity(_ context.Context, cardID string, args map[string]any) (Result, error) {
	cx, present := argString(args, "complexity")
	if !present {
		return errResult("missing required arg 'complexity'"), nil
	}
	switch cx {
	case "low", "medium", "high":
	default:
		return errResult("invalid complexity %q", cx), nil
	}
	if _, err := h.svc.UpdateFields(cardID, map[string]any{"complexity": cx}); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("complexity → " + cx), nil
}

func (h *Handlers) SetProgress(_ context.Context, cardID string, args map[string]any) (Result, error) {
	step, ok1 := argInt(args, "step")
	total, ok2 := argInt(args, "totalSteps")
	current, ok3 := argString(args, "currentStep")
	if !ok1 || !ok2 || !ok3 {
		return errResult("missing required args 'step', 'totalSteps', 'currentStep'"), nil
	}
	if _, err := h.svc.SetProgress(cardID, step, total, current); err != nil {
		return errResult("%v", err), nil
	}
	return okResult(fmt.Sprintf("progress %d/%d: %s", step, total, current)), nil
}

func (h *Handlers) ClearProgress(_ context.Context, cardID string, _ map[string]any) (Result, error) {
	if _, err := h.svc.ClearProgress(cardID); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("progress cleared"), nil
}

func (h *Handlers) SetBlocked(_ context.Context, cardID string, args map[string]any) (Result, error) {
	reason, present := argString(args, "reason")
	if !present {
		return errResult("missing required arg 'reason'"), nil
	}
	if _, err := h.svc.SetBlocked(cardID, reason); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("blocked: " + reason), nil
}

func (h *Handlers) ClearBlocked(_ context.Context, cardID string, _ map[string]any) (Result, error) {
	if _, err := h.svc.ClearBlocked(cardID); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("unblocked"), nil
}

func (h *Handlers) AddLabel(_ context.Context, cardID string, args map[string]any) (Result, error) {
	label, present := argString(args, "label")
	if !present {
		return errResult("missing required arg 'label'"), nil
	}
	if _, err := h.svc.AddLabel(cardID, label); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("label +" + label), nil
}

func (h *Handlers) RemoveLabel(_ context.Context, cardID string, args map[string]any) (Result, error) {
	label, present := argString(args, "label")
	if !present {
		return errResult("missing required arg 'label'"), nil
	}
	if _, err := h.svc.RemoveLabel(cardID, label); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("label -" + label), nil
}

func (h *Handlers) AddAcceptanceCriterion(_ context.Context, cardID string, args map[string]any) (Result, error) {
	text, present := argString(args, "text")
	if !present {
		return errResult("missing required arg 'text'"), nil
	}
	if _, err := h.svc.AddAcceptanceCriterion(cardID, text); err != nil {
		return errResult("%v", err), nil
	}
	return okResult("AC added"), nil
}

func (h *Handlers) RemoveAcceptanceCriterion(_ context.Context, cardID string, args map[string]any) (Result, error) {
	idx, present := argInt(args, "index")
	if !present {
		return errResult("missing required arg 'index'"), nil
	}
	if _, err := h.svc.RemoveAcceptanceCriterion(cardID, idx); err != nil {
		return errResult("%v", err), nil
	}
	return okResult(fmt.Sprintf("AC removed [%d]", idx)), nil
}

func (h *Handlers) SetAcceptanceCriteria(_ context.Context, cardID string, args map[string]any) (Result, error) {
	items, present := argStringSlice(args, "items")
	if !present {
		return errResult("missing required arg 'items'"), nil
	}
	if _, err := h.svc.UpdateFields(cardID, map[string]any{"acceptanceCriteria": items}); err != nil {
		return errResult("%v", err), nil
	}
	return okResult(fmt.Sprintf("AC list replaced (%d items)", len(items))), nil
}

func (h *Handlers) SetRelevantFiles(_ context.Context, cardID string, args map[string]any) (Result, error) {
	paths, present := argStringSlice(args, "paths")
	if !present {
		return errResult("missing required arg 'paths'"), nil
	}
	if _, err := h.svc.UpdateFields(cardID, map[string]any{"relevantFiles": paths}); err != nil {
		return errResult("%v", err), nil
	}
	return okResult(fmt.Sprintf("relevantFiles replaced (%d)", len(paths))), nil
}

```

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && go test ./internal/mcp/... -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/handlers.go backend/internal/mcp/handlers_test.go
git commit -m "feat(mcp): add 16 tool handlers dispatching to CardMutator"
```

---

### Task 9: MCP HTTP server with mcp-go + session middleware (TDD)

**Files:**
- Create: `backend/internal/mcp/server.go`
- Create: `backend/internal/mcp/server_test.go`

- [ ] **Step 1: Write failing test**

Create `backend/internal/mcp/server_test.go`:

```go
package mcp

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func newTestServer(t *testing.T) (*httptest.Server, *Sessions, *card.Service) {
	t.Helper()
	store := card.NewStore()
	svc := card.NewService(store)
	sessions := NewSessions()
	srv := NewServer(svc, sessions)
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return ts, sessions, svc
}

func TestServer_UnknownToken_Returns401(t *testing.T) {
	ts, _, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, ts.URL+"/?token=ghost", strings.NewReader(`{}`))
	req.RequestURI = ""
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestServer_ToolCall_SetSummary_HappyPath(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	c := svc.CreateCard("p", "x")
	tok := sessions.Mint(c.ID)

	body := `{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/call",
		"params": {
			"name": "mcp__agent_desk__set_summary",
			"arguments": {"summary": "refactoring auth"}
		}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tok, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, body = %s", resp.StatusCode, raw)
	}
	updated, _ := svc.GetCard(c.ID)
	if updated.Summary != "refactoring auth" {
		t.Fatalf("summary = %q, want 'refactoring auth'", updated.Summary)
	}
}

func TestServer_ToolCall_SetStatus_IllegalTransition_ReturnsIsError(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	c := svc.CreateCard("p", "x")
	tok := sessions.Mint(c.ID)

	body := `{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/call",
		"params": {
			"name": "mcp__agent_desk__set_status",
			"arguments": {"column": "done"}
		}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tok, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("http: %v", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	// mcp-go surfaces IsError as part of the CallToolResult JSON; assert
	// the response contains "isError":true somewhere in the payload.
	if !strings.Contains(string(raw), `"isError":true`) {
		t.Fatalf("expected isError:true in response, got %s", raw)
	}
	// And card must NOT have changed.
	after, _ := svc.GetCard(c.ID)
	if after.Column != card.ColumnBacklog {
		t.Fatalf("column = %q, want unchanged backlog", after.Column)
	}
}

func TestServer_ToolCall_WrongSession_ScopedToOwnCard(t *testing.T) {
	ts, sessions, svc := newTestServer(t)
	cA := svc.CreateCard("p", "card A")
	cB := svc.CreateCard("p", "card B")
	tokA := sessions.Mint(cA.ID)

	// Use session A's token to set summary. MCP server must mutate ONLY card A.
	body := `{
		"jsonrpc":"2.0","id":1,"method":"tools/call",
		"params":{"name":"mcp__agent_desk__set_summary","arguments":{"summary":"only A"}}
	}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/?token="+tokA, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	http.DefaultClient.Do(req)

	gotA, _ := svc.GetCard(cA.ID)
	gotB, _ := svc.GetCard(cB.ID)
	if gotA.Summary != "only A" {
		t.Fatalf("card A summary = %q", gotA.Summary)
	}
	if gotB.Summary != "" {
		t.Fatalf("card B summary changed to %q — session leak", gotB.Summary)
	}
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/mcp/ -run TestServer
```

Expected: FAIL — `NewServer` undefined.

- [ ] **Step 3: Implement `server.go`**

Create `backend/internal/mcp/server.go`:

```go
package mcp

import (
	"context"
	"net/http"

	mcpgo "github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const toolPrefix = "mcp__agent_desk__"

type contextKey string

const cardIDKey contextKey = "cardID"

// NewServer builds a streamable HTTP MCP server serving all agent-desk tools.
// Every request must carry a ?token=<tok> query param that resolves via
// sessions → cardID. Token missing or unknown → 401.
func NewServer(svc CardMutator, sessions *Sessions) http.Handler {
	handlers := NewHandlers(svc)

	s := server.NewMCPServer(
		"agent-desk",
		"0.1.0",
	)

	registerTool(s, toolPrefix+"get_card",
		"Return the card's full state as JSON.",
		nil, handlers.GetCard)

	registerTool(s, toolPrefix+"set_status",
		"Move the card to a new column (backlog|in_progress|review|done). Validated against the state machine.",
		mcpgo.NewToolInputSchema(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"column": map[string]any{
					"type": "string",
					"enum": []string{"backlog", "in_progress", "review", "done"},
				},
			},
			"required": []string{"column"},
		}),
		handlers.SetStatus)

	registerTool(s, toolPrefix+"set_title",
		"Set the card title (≤200 chars).",
		stringArgSchema("title", 200),
		handlers.SetTitle)

	registerTool(s, toolPrefix+"set_description",
		"Set the card description in markdown (≤8000 chars).",
		stringArgSchema("description", 8000),
		handlers.SetDescription)

	registerTool(s, toolPrefix+"set_summary",
		"Set a one-line status summary shown on the card face (≤280 chars). Empty string clears.",
		stringArgSchema("summary", 280),
		handlers.SetSummary)

	registerTool(s, toolPrefix+"set_complexity",
		"Set complexity (low|medium|high).",
		mcpgo.NewToolInputSchema(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"complexity": map[string]any{"type": "string", "enum": []string{"low", "medium", "high"}},
			},
			"required": []string{"complexity"},
		}),
		handlers.SetComplexity)

	registerTool(s, toolPrefix+"set_progress",
		"Set live progress snapshot: step/totalSteps and currentStep text.",
		mcpgo.NewToolInputSchema(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"step":        map[string]any{"type": "integer", "minimum": 0},
				"totalSteps":  map[string]any{"type": "integer", "minimum": 1},
				"currentStep": map[string]any{"type": "string"},
			},
			"required": []string{"step", "totalSteps", "currentStep"},
		}),
		handlers.SetProgress)

	registerTool(s, toolPrefix+"clear_progress",
		"Clear the progress snapshot.",
		nil, handlers.ClearProgress)

	registerTool(s, toolPrefix+"set_blocked",
		"Mark the card blocked with a non-empty reason.",
		mcpgo.NewToolInputSchema(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"reason": map[string]any{"type": "string", "minLength": 1},
			},
			"required": []string{"reason"},
		}),
		handlers.SetBlocked)

	registerTool(s, toolPrefix+"clear_blocked",
		"Unmark the card as blocked.",
		nil, handlers.ClearBlocked)

	registerTool(s, toolPrefix+"add_label",
		"Add a label (trimmed, deduped).",
		stringArgSchema("label", 50),
		handlers.AddLabel)

	registerTool(s, toolPrefix+"remove_label",
		"Remove a label.",
		stringArgSchema("label", 50),
		handlers.RemoveLabel)

	registerTool(s, toolPrefix+"add_acceptance_criterion",
		"Append an acceptance criterion to the list.",
		stringArgSchema("text", 500),
		handlers.AddAcceptanceCriterion)

	registerTool(s, toolPrefix+"remove_acceptance_criterion",
		"Remove the acceptance criterion at the given index.",
		mcpgo.NewToolInputSchema(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"index": map[string]any{"type": "integer", "minimum": 0},
			},
			"required": []string{"index"},
		}),
		handlers.RemoveAcceptanceCriterion)

	registerTool(s, toolPrefix+"set_acceptance_criteria",
		"Replace the entire acceptance criteria list.",
		stringArrayArgSchema("items"),
		handlers.SetAcceptanceCriteria)

	registerTool(s, toolPrefix+"set_relevant_files",
		"Replace the relevant files list.",
		stringArrayArgSchema("paths"),
		handlers.SetRelevantFiles)

	streamable := server.NewStreamableHTTPServer(s)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := r.URL.Query().Get("token")
		if tok == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}
		cardID, ok := sessions.Resolve(tok)
		if !ok {
			http.Error(w, "unknown session token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), cardIDKey, cardID)
		streamable.ServeHTTP(w, r.WithContext(ctx))
	})
}

// toolHandler adapts our Result-returning handler methods into the mcp-go
// callback signature, pulling the scoped cardID from context.
type toolHandler func(ctx context.Context, cardID string, args map[string]any) (Result, error)

func registerTool(s *server.MCPServer, name, description string, schema *mcpgo.ToolInputSchema, fn toolHandler) {
	opts := []mcpgo.ToolOption{mcpgo.WithDescription(description)}
	if schema != nil {
		opts = append(opts, mcpgo.WithRawInputSchema(schema.Raw()))
	}
	tool := mcpgo.NewTool(name, opts...)

	s.AddTool(tool, func(ctx context.Context, req mcpgo.CallToolRequest) (*mcpgo.CallToolResult, error) {
		cardID, _ := ctx.Value(cardIDKey).(string)
		if cardID == "" {
			return mcpgo.NewToolResultError("no card bound to this session"), nil
		}
		args, _ := req.Params.Arguments.(map[string]any)
		if args == nil {
			args = map[string]any{}
		}
		res, err := fn(ctx, cardID, args)
		if err != nil {
			return nil, err
		}
		if res.IsError {
			return mcpgo.NewToolResultError(res.Message), nil
		}
		return mcpgo.NewToolResultText(res.Message), nil
	})
}

func stringArgSchema(name string, maxLen int) *mcpgo.ToolInputSchema {
	return mcpgo.NewToolInputSchema(map[string]any{
		"type": "object",
		"properties": map[string]any{
			name: map[string]any{"type": "string", "maxLength": maxLen},
		},
		"required": []string{name},
	})
}

func stringArrayArgSchema(name string) *mcpgo.ToolInputSchema {
	return mcpgo.NewToolInputSchema(map[string]any{
		"type": "object",
		"properties": map[string]any{
			name: map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
		"required": []string{name},
	})
}
```

> **Note:** The exact mcp-go API surface (`NewToolInputSchema`, `WithRawInputSchema`, `Raw()`, `NewStreamableHTTPServer`) should be verified against the library's current version. If the method names differ slightly, adapt them — the plan's contract (session-scoped HTTP MCP server registering 16 tools) stays fixed. Run `go doc github.com/mark3labs/mcp-go/server` and `go doc github.com/mark3labs/mcp-go/mcp` to confirm signatures.

- [ ] **Step 4: Run — expect pass**

```bash
cd backend && go test ./internal/mcp/... -v
```

Expected: PASS. If mcp-go API differs from the draft, adjust the adapter functions until all four server tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/mcp/server.go backend/internal/mcp/server_test.go
git commit -m "feat(mcp): add streamable HTTP MCP server with session token middleware"
```

---

### Task 10: Integration test — full round-trip through mcp-go client

**Files:**
- Create: `backend/internal/mcp/integration_test.go`

- [ ] **Step 1: Write the integration test**

Create `backend/internal/mcp/integration_test.go`:

```go
package mcp

import (
	"context"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

// TestIntegration_ToolChain_FullCardLifecycle exercises a realistic
// sequence: create card in backlog → agent sets summary → sets progress →
// moves to in_progress → sets blocked → clears blocked → moves to review.
// Asserts the final card state matches every intermediate mutation.
func TestIntegration_ToolChain_FullCardLifecycle(t *testing.T) {
	svc := card.NewService(card.NewStore())
	sessions := NewSessions()
	c := svc.CreateCard("p", "lifecycle test")
	tok := sessions.Mint(c.ID)
	_ = tok // used by the server; direct handler test below

	h := NewHandlers(svc)
	ctx := context.Background()

	if _, err := h.SetSummary(ctx, c.ID, map[string]any{"summary": "starting work"}); err != nil {
		t.Fatalf("SetSummary: %v", err)
	}
	if _, err := h.SetProgress(ctx, c.ID, map[string]any{"step": 1, "totalSteps": 4, "currentStep": "reading tests"}); err != nil {
		t.Fatalf("SetProgress: %v", err)
	}
	if _, err := h.SetStatus(ctx, c.ID, map[string]any{"column": "in_progress"}); err != nil {
		t.Fatalf("SetStatus in_progress: %v", err)
	}
	if _, err := h.SetBlocked(ctx, c.ID, map[string]any{"reason": "needs DB schema"}); err != nil {
		t.Fatalf("SetBlocked: %v", err)
	}
	if _, err := h.ClearBlocked(ctx, c.ID, nil); err != nil {
		t.Fatalf("ClearBlocked: %v", err)
	}
	if _, err := h.SetStatus(ctx, c.ID, map[string]any{"column": "review"}); err != nil {
		t.Fatalf("SetStatus review: %v", err)
	}

	final, _ := svc.GetCard(c.ID)
	if final.Summary != "starting work" {
		t.Errorf("summary = %q", final.Summary)
	}
	if final.Progress == nil || final.Progress.Step != 1 || final.Progress.TotalSteps != 4 {
		t.Errorf("progress = %+v", final.Progress)
	}
	if final.Column != card.ColumnReview {
		t.Errorf("column = %q, want review", final.Column)
	}
	if final.BlockedReason != "" {
		t.Errorf("BlockedReason = %q, want empty", final.BlockedReason)
	}
	if final.UpdatedAt <= c.CreatedAt {
		t.Errorf("UpdatedAt not advanced")
	}
}
```

- [ ] **Step 2: Run**

```bash
cd backend && go test ./internal/mcp/ -run TestIntegration -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/mcp/integration_test.go
git commit -m "test(mcp): add full card-lifecycle integration test"
```

---

### Task 11: Full backend test sweep — green baseline before Lane C

- [ ] **Step 1: Run everything**

```bash
cd backend && go test ./... && go build ./...
```

Expected: PASS on all packages, clean build. Any regression means a prior task is incomplete — fix it before moving on.

---

## Lane C — Backend wiring

### Task 12: Write temp `.mcp.json` + update `buildArgs` to pass `--mcp-config` and `--allowed-tools` (TDD)

**Files:**
- Modify: `backend/internal/agent/manager.go`
- Modify: `backend/internal/agent/manager_test.go`

- [ ] **Step 1: Write failing tests**

Append to `backend/internal/agent/manager_test.go` (create the file's test skeleton if absent using the existing patterns):

```go
func TestBuildArgs_IncludesMcpConfigAndAllowedTools(t *testing.T) {
	args := buildArgs("", "", "", "msg", "/tmp/mcp-session-abc.json")
	want := []string{"--mcp-config", "/tmp/mcp-session-abc.json"}
	if !containsSubsequence(args, want) {
		t.Fatalf("args missing %v: %v", want, args)
	}
	wantAllowed := []string{"--allowed-tools", "mcp__agent_desk__*"}
	if !containsSubsequence(args, wantAllowed) {
		t.Fatalf("args missing %v: %v", wantAllowed, args)
	}
}

func TestBuildArgs_EmptyMcpConfig_OmitsFlag(t *testing.T) {
	args := buildArgs("", "", "", "msg", "")
	for _, a := range args {
		if a == "--mcp-config" {
			t.Fatal("did not expect --mcp-config when config path is empty")
		}
	}
}

func containsSubsequence(haystack, needle []string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j, n := range needle {
			if haystack[i+j] != n {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend && go test ./internal/agent/ -run TestBuildArgs
```

Expected: FAIL — `buildArgs` takes 4 args, not 5.

- [ ] **Step 3: Update `buildArgs`**

In `backend/internal/agent/manager.go`, replace `buildArgs` (lines 58-77) with:

```go
func buildArgs(sessionID, model, effort, message, mcpConfigPath string) []string {
	args := []string{
		"-p",
		"--verbose",
		"--output-format", "stream-json",
		"--include-partial-messages",
		"--append-system-prompt", agentSystemPrompt,
	}
	if mcpConfigPath != "" {
		args = append(args, "--mcp-config", mcpConfigPath, "--allowed-tools", "mcp__agent_desk__*")
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

And update the single call site inside `Send` (line 106):

```go
	args := buildArgs(req.SessionID, req.Model, req.Effort, req.Message, req.McpConfigPath)
```

- [ ] **Step 4: Add `McpConfigPath` to `SendRequest`**

In `backend/internal/agent/manager.go`, extend `SendRequest` (lines 80-87):

```go
type SendRequest struct {
	CardID        string
	SessionID     string
	Model         string
	Effort        string
	Message       string
	WorkDir       string // absolute path to the project repo
	McpConfigPath string // absolute path to a temp .mcp.json, or "" for none
}
```

- [ ] **Step 5: Run — expect pass**

```bash
cd backend && go test ./internal/agent/ -v
```

Expected: PASS. Existing tests still pass because new field defaults to "".

- [ ] **Step 6: Commit**

```bash
git add backend/internal/agent/
git commit -m "feat(agent): thread McpConfigPath through Send, buildArgs adds --mcp-config + --allowed-tools"
```

---

### Task 13: WebSocket handler mints MCP session + writes config before spawn

**Files:**
- Modify: `backend/internal/websocket/handler.go` (Send call site)
- Modify: `backend/internal/websocket/handler_test.go`

This is the glue task. Locate the code that constructs `agent.SendRequest` inside the WS handler (grep for `agent.SendRequest{` or `mgr.Send(`).

- [ ] **Step 1: Grep for the Send call site**

```bash
cd backend && grep -n "mgr.Send\|agent.SendRequest\|m.Send\|agentMgr.Send" internal/websocket/handler.go
```

Note the line number for Step 3.

- [ ] **Step 2: Add `Sessions` + port to WS handler constructor**

In `backend/internal/websocket/handler.go`, find `NewHandler` and extend it to take `*mcp.Sessions` plus an HTTP listener port (pass `0` as a sentinel meaning "MCP is not mounted"). Store both on the handler struct.

```go
// near top of file
import (
	// existing imports...
	"github.com/jackuait/agent-desk/backend/internal/mcp"
)

// existing Handler struct — add:
type Handler struct {
	// ...existing fields...
	sessions *mcp.Sessions
	mcpPort  int
}

// Replace NewHandler signature:
func NewHandler(
	hub *Hub,
	agentMgr *agent.Manager,
	cardSvc *card.Service,
	projectStore *project.Store,
	sessions *mcp.Sessions,
	mcpPort int,
) *Handler {
	return &Handler{
		// ...existing assignments...
		sessions: sessions,
		mcpPort:  mcpPort,
	}
}
```

- [ ] **Step 3: Mint session + write `.mcp.json` before `mgr.Send`**

Just before the existing `mgr.Send(...)` call in the handler, insert:

```go
	var mcpConfigPath string
	if h.sessions != nil && h.mcpPort > 0 {
		tok := h.sessions.Mint(cardID)
		defer h.sessions.Revoke(tok)

		cfgPath, err := writeMcpConfig(cardID, tok, h.mcpPort)
		if err != nil {
			// Log and continue without MCP — spawning still works.
			log.Printf("mcp config write failed: %v", err)
		} else {
			mcpConfigPath = cfgPath
			defer os.Remove(cfgPath)
		}
	}

	// then in the SendRequest literal below, set:
	//   McpConfigPath: mcpConfigPath,
```

Add the helper at the bottom of `handler.go`:

```go
// writeMcpConfig writes a temporary .mcp.json pointing at the backend's
// MCP endpoint with the given session token, and returns its absolute path.
// The caller is responsible for removing the file.
func writeMcpConfig(cardID, token string, port int) (string, error) {
	cfg := map[string]any{
		"mcpServers": map[string]any{
			"agent_desk": map[string]any{
				"type": "http",
				"url":  fmt.Sprintf("http://127.0.0.1:%d/mcp?token=%s", port, token),
			},
		},
	}
	payload, err := json.Marshal(cfg)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp("", "agent-desk-mcp-"+cardID+"-*.json")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(payload); err != nil {
		return "", err
	}
	return f.Name(), nil
}
```

Ensure these imports exist at the top of `handler.go`: `"encoding/json"`, `"fmt"`, `"log"`, `"os"`, and `"github.com/jackuait/agent-desk/backend/internal/mcp"`.

- [ ] **Step 4: Update existing handler tests that construct `NewHandler`**

Grep for every call site of `NewHandler` in the backend:

```bash
cd backend && grep -rn "ws.NewHandler\|websocket.NewHandler" --include="*.go"
```

For each call site (there will be at least `handler_test.go` + `main.go`), pass `nil` for `sessions` and `0` for `mcpPort` to preserve existing behavior in tests.

- [ ] **Step 5: Add a new test for the wiring**

Append to `backend/internal/websocket/handler_test.go`:

```go
func TestHandler_MintsMcpSession_WhenConfigured(t *testing.T) {
	sessions := mcp.NewSessions()
	// ... minimal handler construction: nil agent/cardSvc/project is
	// acceptable if the branch under test just reaches sessions.Mint.
	//
	// This test exists to pin the contract: when sessions and mcpPort
	// are provided, a Mint happens on Send. Use an in-memory test double
	// for agent.Manager so Send does not actually spawn.
	//
	// Implementers: look at the existing handler_test.go patterns for
	// how the test hub + fakes are constructed, then assert
	// len(sessions.byToken) > 0 after dispatching a "message" event.
	t.Skip("fill in using existing handler_test.go fake patterns")
}
```

> **Note:** The handler test uses the project's existing fake agent manager patterns. The skipped test is a placeholder for the implementing engineer to flesh out; it documents the intended contract. Do not leave the skip in place if a straightforward assertion is available.

- [ ] **Step 6: Run backend build + tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: PASS. If compile errors, fix call sites until clean.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/websocket/
git commit -m "feat(ws): mint MCP session + write temp mcp config before agent spawn"
```

---

### Task 14: Mount MCP server in `main.go`

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add MCP mount + pass `sessions` into `NewHandler`**

In `backend/cmd/server/main.go`, after `cardSvc := card.NewService(cardStore)` and before the WS handler construction, insert:

```go
	mcpSessions := mcp.NewSessions()
	mcpHandler := mcp.NewServer(cardSvc, mcpSessions)
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/mcp/", http.StripPrefix("/mcp", mcpHandler))
```

Then update the WS handler construction:

```go
	wsHandler := ws.NewHandler(wsHub, agentMgr, cardSvc, projectStore, mcpSessions, 8080)
```

Add import: `"github.com/jackuait/agent-desk/backend/internal/mcp"`.

- [ ] **Step 2: Build**

```bash
cd backend && go build ./...
```

Expected: clean build.

- [ ] **Step 3: Run full backend test sweep**

```bash
cd backend && go test ./...
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat(server): mount MCP server at /mcp with session-scoped auth"
```

---

## Lane D — Frontend types + card UI

### Task 15: Extend Card type + testing factory

**Files:**
- Modify: `frontend/src/shared/types/domain.ts`
- Modify (if present): `frontend/src/shared/test-utils/fixtures.ts` or equivalent

- [ ] **Step 1: Add fields to `Card`**

In `frontend/src/shared/types/domain.ts`, replace the `Card` interface (lines 23-39) with:

```ts
export interface Progress {
  step: number;
  totalSteps: number;
  currentStep: string;
}

export interface Card {
  id: string;
  projectId: string;
  title: string;
  description: string;
  column: CardColumn;
  acceptanceCriteria: string[];
  complexity: string;
  relevantFiles: string[];
  labels: string[];
  summary: string;
  blockedReason: string;
  progress: Progress | null;
  sessionId: string;
  worktreePath: string;
  branchName: string;
  prUrl: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  effort: string;
}
```

- [ ] **Step 2: Update every `Card` test factory to include defaults**

Grep for factories:

```bash
cd frontend && grep -rn "makeCard\|function.*: Card\|: Card =" src/
```

For each factory (typically `makeCard` in test files), add the new fields with defaults: `labels: []`, `summary: ""`, `blockedReason: ""`, `progress: null`, `updatedAt: 0`. Keep changes minimal — only append the new field defaults; do not reorder existing keys.

- [ ] **Step 3: Run type-check**

```bash
cd frontend && yarn tsc --noEmit
```

Expected: any `TS2741` errors point at spots where `Card` literals are missing the new fields. Fix each.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && yarn test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/types/domain.ts frontend/src/
git commit -m "feat(types): add labels, summary, blockedReason, progress, updatedAt to Card"
```

---

### Task 16: `ProgressBar` leaf component (TDD)

**Files:**
- Create: `frontend/src/features/card/ProgressBar.tsx`
- Create: `frontend/src/features/card/ProgressBar.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/features/card/ProgressBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders step/totalSteps and currentStep text", () => {
    render(<ProgressBar step={2} totalSteps={5} currentStep="writing tests" />);
    expect(screen.getByText("writing tests")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("exposes progressbar role with aria-valuenow", () => {
    render(<ProgressBar step={3} totalSteps={4} currentStep="x" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
  });

  it("clamps percentage at 100 even if step === totalSteps", () => {
    render(<ProgressBar step={5} totalSteps={5} currentStep="done" />);
    const fill = screen.getByTestId("progress-fill");
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/card/ProgressBar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/features/card/ProgressBar.tsx`:

```tsx
interface ProgressBarProps {
  step: number;
  totalSteps: number;
  currentStep: string;
}

export function ProgressBar({ step, totalSteps, currentStep }: ProgressBarProps) {
  const pct = totalSteps === 0 ? 0 : Math.min(100, Math.round((step / totalSteps) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{currentStep}</span>
        <span className="font-mono">
          {step} / {totalSteps}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        className="h-1 w-full rounded-full bg-bg-hover overflow-hidden"
      >
        <div
          data-testid="progress-fill"
          className="h-full bg-accent-blue transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/card/ProgressBar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/ProgressBar.tsx frontend/src/features/card/ProgressBar.test.tsx
git commit -m "feat(card): add ProgressBar leaf component"
```

---

### Task 17: `BlockedBanner` + `LabelChips` leaf components (TDD)

**Files:**
- Create: `frontend/src/features/card/BlockedBanner.tsx`
- Create: `frontend/src/features/card/BlockedBanner.test.tsx`
- Create: `frontend/src/features/card/LabelChips.tsx`
- Create: `frontend/src/features/card/LabelChips.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/features/card/BlockedBanner.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockedBanner } from "./BlockedBanner";

describe("BlockedBanner", () => {
  it("renders the reason with a blocked label", () => {
    render(<BlockedBanner reason="waiting on DB schema" />);
    expect(screen.getByText(/waiting on DB schema/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
```

Create `frontend/src/features/card/LabelChips.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LabelChips } from "./LabelChips";

describe("LabelChips", () => {
  it("renders a chip per label", () => {
    render(<LabelChips labels={["bug", "urgent"]} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders nothing for empty list", () => {
    const { container } = render(<LabelChips labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/card/BlockedBanner.test.tsx src/features/card/LabelChips.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `frontend/src/features/card/BlockedBanner.tsx`:

```tsx
interface BlockedBannerProps {
  reason: string;
}

export function BlockedBanner({ reason }: BlockedBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        <span className="font-medium">Blocked:</span> {reason}
      </span>
    </div>
  );
}
```

Create `frontend/src/features/card/LabelChips.tsx`:

```tsx
interface LabelChipsProps {
  labels: string[];
}

export function LabelChips({ labels }: LabelChipsProps) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l}
          className="inline-block rounded bg-bg-hover px-1.5 py-0.5 text-[11px] text-text-secondary"
        >
          {l}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/card/BlockedBanner.test.tsx src/features/card/LabelChips.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/BlockedBanner.tsx frontend/src/features/card/BlockedBanner.test.tsx frontend/src/features/card/LabelChips.tsx frontend/src/features/card/LabelChips.test.tsx
git commit -m "feat(card): add BlockedBanner and LabelChips leaf components"
```

---

### Task 18: Wire new components into `CardContent` (TDD)

**Files:**
- Modify: `frontend/src/features/card/CardContent.tsx`
- Modify: `frontend/src/features/card/CardContent.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `frontend/src/features/card/CardContent.test.tsx`:

```tsx
describe("CardContent new fields", () => {
  const base = makeCard({
    id: "c1",
    title: "t",
    description: "d",
    column: "in_progress",
  });

  it("renders summary when present", () => {
    render(<CardContent card={{ ...base, summary: "refactoring auth" }} onApprove={() => {}} onMerge={() => {}} />);
    expect(screen.getByText("refactoring auth")).toBeInTheDocument();
  });

  it("hides summary when empty", () => {
    render(<CardContent card={{ ...base, summary: "" }} onApprove={() => {}} onMerge={() => {}} />);
    expect(screen.queryByText("refactoring auth")).not.toBeInTheDocument();
  });

  it("renders progress bar when progress set", () => {
    render(
      <CardContent
        card={{ ...base, progress: { step: 2, totalSteps: 4, currentStep: "tests" } }}
        onApprove={() => {}}
        onMerge={() => {}}
      />,
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("renders blocked banner when reason set", () => {
    render(
      <CardContent
        card={{ ...base, blockedReason: "needs schema" }}
        onApprove={() => {}}
        onMerge={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("needs schema");
  });

  it("renders label chips", () => {
    render(
      <CardContent
        card={{ ...base, labels: ["bug", "urgent"] }}
        onApprove={() => {}}
        onMerge={() => {}}
      />,
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders relative updatedAt when set", () => {
    const now = Math.floor(Date.now() / 1000);
    render(
      <CardContent
        card={{ ...base, updatedAt: now - 30 }}
        onApprove={() => {}}
        onMerge={() => {}}
      />,
    );
    // 30s ago → "updated 30s ago" or similar; match loose.
    expect(screen.getByTestId("updated-at")).toHaveTextContent(/updated\s+\d+s\s+ago/);
  });
});
```

Make sure `makeCard` (or the equivalent factory) is exported from a shared test-utils module; create one if absent.

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/card/CardContent.test.tsx
```

Expected: FAIL — new expectations not yet satisfied.

- [ ] **Step 3: Wire components into `CardContent.tsx`**

In `frontend/src/features/card/CardContent.tsx`, add imports at top:

```tsx
import { ProgressBar } from "./ProgressBar";
import { BlockedBanner } from "./BlockedBanner";
import { LabelChips } from "./LabelChips";
```

Inside the returned `<div>` (line 17 of the current file):

- After the column/project row, add: `<LabelChips labels={card.labels} />`
- After `<h3>{card.title}</h3>` (line 27), add:

```tsx
      {card.summary && (
        <p className="text-sm italic text-text-secondary m-0">{card.summary}</p>
      )}

      {card.progress && (
        <ProgressBar
          step={card.progress.step}
          totalSteps={card.progress.totalSteps}
          currentStep={card.progress.currentStep}
        />
      )}

      {card.blockedReason && <BlockedBanner reason={card.blockedReason} />}
```

At the top of `CardContent.tsx` add a tiny relative-time helper:

```tsx
function formatRelative(epochSec: number): string {
  if (!epochSec) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
```

At the end of the returned `<div>`, add:

```tsx
      {card.updatedAt > 0 && (
        <span data-testid="updated-at" className="text-[11px] text-text-muted">
          updated {formatRelative(card.updatedAt)}
        </span>
      )}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/card/CardContent.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/card/CardContent.tsx frontend/src/features/card/CardContent.test.tsx
git commit -m "feat(card): render summary, progress, blocked banner, labels in CardContent"
```

---

## Lane E — Frontend board thumbnail + chat tool labels

### Task 19: `KanbanCard` thumbnail — summary, labels, progress, blocked dot (TDD)

**Files:**
- Modify: `frontend/src/features/board/KanbanCard.tsx`
- Modify: `frontend/src/features/board/KanbanCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `frontend/src/features/board/KanbanCard.test.tsx`:

```tsx
describe("KanbanCard new fields", () => {
  it("renders summary as secondary line", () => {
    const c = makeCard({ title: "t", summary: "refactoring auth" });
    render(<KanbanCard card={c} />);
    expect(screen.getByText("refactoring auth")).toBeInTheDocument();
  });

  it("renders label chips", () => {
    const c = makeCard({ title: "t", labels: ["bug"] });
    render(<KanbanCard card={c} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("renders thin progress bar when progress set", () => {
    const c = makeCard({ title: "t", progress: { step: 1, totalSteps: 3, currentStep: "x" } });
    render(<KanbanCard card={c} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders blocked dot when reason set", () => {
    const c = makeCard({ title: "t", blockedReason: "stuck" });
    render(<KanbanCard card={c} />);
    expect(screen.getByTestId("blocked-dot")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/board/KanbanCard.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Extend `KanbanCard.tsx`**

Replace the `<article>` contents in `frontend/src/features/board/KanbanCard.tsx` (lines 25-64) so it includes the new rendering slots. Insert after the existing `<h3>` block and before the description block:

```tsx
      {card.summary && (
        <p className="text-xs text-text-secondary line-clamp-1">{card.summary}</p>
      )}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span
              key={l}
              className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-secondary"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      {card.progress && (
        <div
          role="progressbar"
          aria-valuenow={card.progress.step}
          aria-valuemax={card.progress.totalSteps}
          className="h-[2px] w-full rounded bg-bg-hover overflow-hidden"
        >
          <div
            className="h-full bg-accent-blue"
            style={{
              width: `${Math.min(100, (card.progress.step / Math.max(1, card.progress.totalSteps)) * 100)}%`,
            }}
          />
        </div>
      )}
      {card.blockedReason && (
        <span
          data-testid="blocked-dot"
          aria-label={`blocked: ${card.blockedReason}`}
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500"
        />
      )}
```

Add `relative` to the `<article>` `className` so the blocked dot positions correctly.

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/board/KanbanCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/board/
git commit -m "feat(board): KanbanCard renders summary, labels, progress, blocked dot"
```

---

### Task 20: Agent-Desk tool label map (TDD)

**Files:**
- Create: `frontend/src/features/chat/agentDeskToolLabels.ts`
- Create: `frontend/src/features/chat/agentDeskToolLabels.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/features/chat/agentDeskToolLabels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { labelForAgentDeskTool } from "./agentDeskToolLabels";

describe("labelForAgentDeskTool", () => {
  it("returns null for non-agent-desk tools", () => {
    expect(labelForAgentDeskTool("Bash", {})).toBeNull();
  });

  it("labels set_status", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_status", { column: "review" })).toBe(
      "Status → review",
    );
  });

  it("labels set_summary", () => {
    expect(
      labelForAgentDeskTool("mcp__agent_desk__set_summary", { summary: "refactoring auth" }),
    ).toBe("Summary: refactoring auth");
  });

  it("labels set_progress", () => {
    expect(
      labelForAgentDeskTool("mcp__agent_desk__set_progress", {
        step: 2,
        totalSteps: 5,
        currentStep: "writing tests",
      }),
    ).toBe("Progress: 2/5 writing tests");
  });

  it("labels add_label", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__add_label", { label: "bug" })).toBe("+Label bug");
  });

  it("labels remove_label", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__remove_label", { label: "bug" })).toBe(
      "−Label bug",
    );
  });

  it("labels set_blocked", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_blocked", { reason: "waiting" })).toBe(
      "Blocked: waiting",
    );
  });

  it("labels clear_blocked", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__clear_blocked", {})).toBe("Unblocked");
  });

  it("falls back to tool name for unknown agent-desk tools", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_title", { title: "x" })).toBe("Title: x");
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/chat/agentDeskToolLabels.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `frontend/src/features/chat/agentDeskToolLabels.ts`:

```ts
const PREFIX = "mcp__agent_desk__";

type Args = Record<string, unknown>;

type Handler = (args: Args) => string;

const handlers: Record<string, Handler> = {
  set_status: (a) => `Status → ${String(a.column ?? "?")}`,
  set_title: (a) => `Title: ${String(a.title ?? "")}`,
  set_description: () => "Description updated",
  set_summary: (a) => `Summary: ${String(a.summary ?? "")}`,
  set_complexity: (a) => `Complexity → ${String(a.complexity ?? "?")}`,
  set_progress: (a) =>
    `Progress: ${String(a.step ?? "?")}/${String(a.totalSteps ?? "?")} ${String(a.currentStep ?? "")}`.trim(),
  clear_progress: () => "Progress cleared",
  set_blocked: (a) => `Blocked: ${String(a.reason ?? "")}`,
  clear_blocked: () => "Unblocked",
  add_label: (a) => `+Label ${String(a.label ?? "")}`,
  remove_label: (a) => `−Label ${String(a.label ?? "")}`,
  add_acceptance_criterion: (a) => `+AC ${String(a.text ?? "")}`,
  remove_acceptance_criterion: (a) => `−AC [${String(a.index ?? "?")}]`,
  set_acceptance_criteria: (a) =>
    `AC list replaced (${Array.isArray(a.items) ? a.items.length : 0})`,
  set_relevant_files: (a) =>
    `Files replaced (${Array.isArray(a.paths) ? a.paths.length : 0})`,
  get_card: () => "Read card state",
};

export function labelForAgentDeskTool(toolName: string, args: Args): string | null {
  if (!toolName.startsWith(PREFIX)) return null;
  const shortName = toolName.slice(PREFIX.length);
  const fn = handlers[shortName];
  if (!fn) return shortName;
  return fn(args);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/chat/agentDeskToolLabels.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chat/agentDeskToolLabels.ts frontend/src/features/chat/agentDeskToolLabels.test.ts
git commit -m "feat(chat): add agent-desk tool label map"
```

---

### Task 21: Use label map inside `ToolUseBlock` (TDD)

**Files:**
- Modify: `frontend/src/features/chat/ToolUseBlock.tsx`
- Modify: `frontend/src/features/chat/ToolUseBlock.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `frontend/src/features/chat/ToolUseBlock.test.tsx`:

```tsx
describe("ToolUseBlock agent-desk relabel", () => {
  it("renders semantic label instead of raw tool name for agent-desk tools", () => {
    const block = {
      kind: "tool_use" as const,
      toolId: "x",
      toolName: "mcp__agent_desk__set_status",
      partialJson: JSON.stringify({ column: "review" }),
      done: true,
      result: undefined,
    };
    render(<ToolUseBlock block={block as any} />);
    expect(screen.getByText("Status → review")).toBeInTheDocument();
  });

  it("falls back to raw tool name for non-agent-desk tools", () => {
    const block = {
      kind: "tool_use" as const,
      toolId: "x",
      toolName: "Bash",
      partialJson: JSON.stringify({ command: "ls" }),
      done: true,
      result: undefined,
    };
    render(<ToolUseBlock block={block as any} />);
    expect(screen.getByText("Bash")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd frontend && yarn test src/features/chat/ToolUseBlock.test.tsx
```

Expected: FAIL on the new assertions.

- [ ] **Step 3: Wire the label map**

In `frontend/src/features/chat/ToolUseBlock.tsx`, add import:

```tsx
import { labelForAgentDeskTool } from "./agentDeskToolLabels";
```

Inside the `ToolUseBlock` function, compute the display label:

```tsx
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = block.partialJson ? JSON.parse(block.partialJson) : {};
  } catch {
    parsedArgs = {};
  }
  const semanticLabel = labelForAgentDeskTool(block.toolName, parsedArgs);
  const displayLabel = semanticLabel ?? block.toolName;
```

Replace the existing label render (the `<span>` that shows `{block.toolName}`, line 69) with:

```tsx
        <span className="font-mono text-[12px] font-semibold tracking-[0.01em] text-text-primary">
          {displayLabel}
        </span>
```

- [ ] **Step 4: Run — expect pass**

```bash
cd frontend && yarn test src/features/chat/ToolUseBlock.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/chat/ToolUseBlock.tsx frontend/src/features/chat/ToolUseBlock.test.tsx
git commit -m "feat(chat): ToolUseBlock renders semantic labels for agent-desk tools"
```

---

## Lane F — Final verification

### Task 22: Full repo green baseline + manual smoke test

- [ ] **Step 1: Run all backend tests + build**

```bash
cd backend && go test ./... -v && go build ./...
```

Expected: PASS on every package, clean build.

- [ ] **Step 2: Run all frontend tests + lint + build**

```bash
cd frontend && yarn test && yarn lint && yarn build
```

Expected: PASS.

- [ ] **Step 3: Start backend, run manual smoke test**

In one terminal:

```bash
cd backend && go run ./cmd/server
```

In another, verify the MCP endpoint is reachable:

```bash
curl -i "http://127.0.0.1:8080/mcp?token=bogus"
```

Expected: `HTTP/1.1 401 Unauthorized`. Confirms session middleware works.

- [ ] **Step 4: Start frontend, open a card, send a chat message**

```bash
cd frontend && yarn dev
```

Open the browser, create or open a card, send a message like "set the card summary to 'testing MCP'". Watch:

- Chat pane shows a semantic chip reading `Summary: testing MCP`.
- Card face updates with the new summary.
- No errors in browser console or backend logs.

If the agent does not discover the `update_card` tools, verify `.mcp.json` is being written (`ls /tmp/agent-desk-mcp-*.json`) and that `--mcp-config` is present in the spawn args (temporarily add a log in `manager.Send`).

- [ ] **Step 5: Confirmation commit**

```bash
git status
```

Expected: clean. If anything residual, amend it into the previous task's commit or create a new one.

---

## Definition of done

- Every Lane A–E task green, committed, with its tests passing.
- `backend/internal/mcp/` package exists with the 16 tool handlers and the session-scoped HTTP server.
- `agent.Manager.Send` receives an `McpConfigPath` and writes `--mcp-config` + `--allowed-tools`.
- `main.go` mounts the MCP server at `/mcp`.
- `Card` has the five new fields on both backend and frontend.
- `CardContent`, `KanbanCard`, and `ToolUseBlock` render the new fields and semantic labels.
- The manual smoke test in Task 22 shows an agent mutation round-trip live.
