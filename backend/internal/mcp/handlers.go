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
