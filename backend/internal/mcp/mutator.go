package mcp

import "github.com/jackuait/agent-desk/backend/internal/card"

// CardMutator is the subset of card.Service the MCP tool handlers need.
// Extracted as an interface so tool handler tests can mock without standing up a full store.
type CardMutator interface {
	GetCard(id string) (card.Card, error)
	UpdateFieldsFromAgent(id string, fields map[string]any) (card.Card, error)
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

// Compile-time check that *card.Service satisfies CardMutator.
var _ CardMutator = (*card.Service)(nil)
