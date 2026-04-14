package mcp

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/card"
)

func TestSetTitleDoesNotDirtyCard(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "original")

	h := NewHandlers(svc)
	res, err := h.SetTitle(context.Background(), c.ID, map[string]any{"title": "agent chose this"})
	if err != nil || res.IsError {
		t.Fatalf("SetTitle: res=%+v err=%v", res, err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no dirty flags after MCP SetTitle, got %+v", flags)
	}
}

func TestSetDescriptionDoesNotDirtyCard(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")

	h := NewHandlers(svc)
	res, err := h.SetDescription(context.Background(), c.ID, map[string]any{"description": "agent body"})
	if err != nil || res.IsError {
		t.Fatalf("SetDescription: res=%+v err=%v", res, err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no dirty flags after MCP SetDescription, got %+v", flags)
	}
}

type fakeBroadcaster struct {
	calls []struct {
		cardID string
		msg    []byte
	}
}

func (f *fakeBroadcaster) Broadcast(cardID string, msg []byte) {
	f.calls = append(f.calls, struct {
		cardID string
		msg    []byte
	}{cardID, msg})
}

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
func (f *fakeMutator) UpdateFieldsFromAgent(id string, fields map[string]any) (card.Card, error) {
	title, _ := fields["title"].(string)
	return card.Card{ID: id, Title: title}, nil
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

func TestHandler_Mutation_BroadcastsCardUpdate(t *testing.T) {
	m := &fakeMutator{}
	b := &fakeBroadcaster{}
	h := NewHandlersWithBroadcaster(m, b)

	if _, err := h.SetSummary(context.Background(), "card-xyz", map[string]any{"summary": "refactoring"}); err != nil {
		t.Fatalf("SetSummary: %v", err)
	}

	if len(b.calls) != 1 {
		t.Fatalf("broadcaster calls = %d, want 1", len(b.calls))
	}
	if b.calls[0].cardID != "card-xyz" {
		t.Fatalf("broadcast cardID = %q", b.calls[0].cardID)
	}
	payload := string(b.calls[0].msg)
	if !strings.Contains(payload, `"type":"card_update"`) {
		t.Errorf("payload missing type=card_update: %s", payload)
	}
	if !strings.Contains(payload, `"refactoring"`) {
		t.Errorf("payload missing summary value: %s", payload)
	}
}

func TestHandler_GetCard_DoesNotBroadcast(t *testing.T) {
	m := &fakeMutator{}
	b := &fakeBroadcaster{}
	h := NewHandlersWithBroadcaster(m, b)
	if _, err := h.GetCard(context.Background(), "card-1", nil); err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if len(b.calls) != 0 {
		t.Fatalf("GetCard must not broadcast, got %d calls", len(b.calls))
	}
}

func TestHandler_MutationError_DoesNotBroadcast(t *testing.T) {
	m := &fakeMutator{setSummaryErr: errors.New("boom")}
	b := &fakeBroadcaster{}
	h := NewHandlersWithBroadcaster(m, b)
	res, _ := h.SetSummary(context.Background(), "card-1", map[string]any{"summary": "x"})
	if !res.IsError {
		t.Fatal("expected IsError")
	}
	if len(b.calls) != 0 {
		t.Fatalf("errored mutation must not broadcast, got %d", len(b.calls))
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
