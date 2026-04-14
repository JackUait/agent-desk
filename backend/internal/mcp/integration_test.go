package mcp

import (
	"context"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

// TestIntegration_ToolChain_FullCardLifecycle exercises a realistic sequence
// through the Handlers → card.Service path: create card in backlog → agent
// sets summary → progress → moves to in_progress → sets blocked → clears
// blocked → moves to review. Asserts the final card state matches every
// intermediate mutation.
func TestIntegration_ToolChain_FullCardLifecycle(t *testing.T) {
	svc := card.NewService(card.NewStore())
	h := NewHandlers(svc)
	ctx := context.Background()

	c := svc.CreateCard("p", "lifecycle test")

	if res, _ := h.SetSummary(ctx, c.ID, map[string]any{"summary": "starting work"}); res.IsError {
		t.Fatalf("SetSummary: %s", res.Message)
	}
	if res, _ := h.SetProgress(ctx, c.ID, map[string]any{
		"step": 1, "totalSteps": 4, "currentStep": "reading tests",
	}); res.IsError {
		t.Fatalf("SetProgress: %s", res.Message)
	}
	if res, _ := h.SetStatus(ctx, c.ID, map[string]any{"column": "in_progress"}); res.IsError {
		t.Fatalf("SetStatus in_progress: %s", res.Message)
	}
	if res, _ := h.SetBlocked(ctx, c.ID, map[string]any{"reason": "needs DB schema"}); res.IsError {
		t.Fatalf("SetBlocked: %s", res.Message)
	}
	if res, _ := h.ClearBlocked(ctx, c.ID, nil); res.IsError {
		t.Fatalf("ClearBlocked: %s", res.Message)
	}
	if res, _ := h.SetStatus(ctx, c.ID, map[string]any{"column": "review"}); res.IsError {
		t.Fatalf("SetStatus review: %s", res.Message)
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
	if final.UpdatedAt == 0 {
		t.Errorf("UpdatedAt not stamped")
	}
}

// TestIntegration_IllegalTransition_SelfCorrect proves the agent loop works:
// an illegal set_status surfaces as IsError, and a follow-up legal transition
// succeeds on the same card.
func TestIntegration_IllegalTransition_SelfCorrect(t *testing.T) {
	svc := card.NewService(card.NewStore())
	h := NewHandlers(svc)
	ctx := context.Background()
	c := svc.CreateCard("p", "x")

	res, _ := h.SetStatus(ctx, c.ID, map[string]any{"column": "done"})
	if !res.IsError {
		t.Fatal("expected IsError for backlog → done")
	}

	res, _ = h.SetStatus(ctx, c.ID, map[string]any{"column": "in_progress"})
	if res.IsError {
		t.Fatalf("expected legal backlog → in_progress, got error: %s", res.Message)
	}

	after, _ := svc.GetCard(c.ID)
	if after.Column != card.ColumnInProgress {
		t.Fatalf("column = %q", after.Column)
	}
}
