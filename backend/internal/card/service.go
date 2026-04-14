package card

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/domain"
)

type source int

const (
	sourceUser  source = iota
	sourceAgent source = iota
)

type Service struct {
	store *Store

	dirtyMu sync.Mutex
	dirty   map[string]map[string]struct{} // cardID -> flagSet
}

func NewService(store *Store) *Service {
	return &Service{
		store: store,
		dirty: make(map[string]map[string]struct{}),
	}
}

func (s *Service) CreateCard(projectID, title string) Card {
	return s.store.Create(projectID, title)
}

func (s *Service) GetCard(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	return c, nil
}

func (s *Service) ListCards(projectID string) []Card {
	return s.store.List(projectID)
}

func (s *Service) DeleteByProject(projectID string) int {
	return s.store.DeleteByProject(projectID)
}

func (s *Service) DeleteCard(id string) error {
	if !s.store.Delete(id) {
		return fmt.Errorf("card %q not found", id)
	}
	return nil
}

// UpdateFields applies a partial update to allowed string and slice fields.
// Stamps UpdatedAt on any successful change. Marks title/description dirty
// so user edits can be detected downstream.
func (s *Service) UpdateFields(id string, fields map[string]any) (Card, error) {
	return s.updateFieldsWithSource(id, fields, sourceUser)
}

// UpdateFieldsFromAgent is the same as UpdateFields but does not mark
// the card dirty. Called by MCP handlers so agent self-edits don't feed
// back into the dirty stream.
func (s *Service) UpdateFieldsFromAgent(id string, fields map[string]any) (Card, error) {
	return s.updateFieldsWithSource(id, fields, sourceAgent)
}

func (s *Service) updateFieldsWithSource(id string, fields map[string]any, src source) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	for k, v := range fields {
		switch k {
		case "title":
			if str, ok := v.(string); ok {
				c.Title = str
				if src == sourceUser {
					s.MarkDirty(id, "title")
				}
			}
		case "description":
			if str, ok := v.(string); ok {
				c.Description = str
				if src == sourceUser {
					s.MarkDirty(id, "description")
				}
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

// MarkDirty records that the user mutated `flag` on `id`. Safe to call multiple
// times; later calls are idempotent per flag.
func (s *Service) MarkDirty(id, flag string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	set, ok := s.dirty[id]
	if !ok {
		set = make(map[string]struct{})
		s.dirty[id] = set
	}
	set[flag] = struct{}{}
}

// DrainDirty returns the current flag set for id and clears it.
// The second return value is reserved for an attachment diff and is empty
// for now; it will be populated in a later task.
func (s *Service) DrainDirty(id string) ([]string, any) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()
	set := s.dirty[id]
	if len(set) == 0 {
		return nil, nil
	}
	out := make([]string, 0, len(set))
	for f := range set {
		out = append(out, f)
	}
	delete(s.dirty, id)
	return out, nil
}

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

// StartDevelopment transitions a card from Backlog → InProgress.
func (s *Service) StartDevelopment(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column != ColumnBacklog {
		return Card{}, fmt.Errorf("StartDevelopment requires column %q, card is in %q", ColumnBacklog, c.Column)
	}
	c.Column = ColumnInProgress
	s.touch(&c)
	return c, nil
}

// MoveToReview transitions a card from InProgress → Review.
func (s *Service) MoveToReview(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column != ColumnInProgress {
		return Card{}, fmt.Errorf("MoveToReview requires column %q, card is in %q", ColumnInProgress, c.Column)
	}
	c.Column = ColumnReview
	s.touch(&c)
	return c, nil
}

// RejectToInProgress transitions a card from Review → InProgress.
func (s *Service) RejectToInProgress(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column != ColumnReview {
		return Card{}, fmt.Errorf("RejectToInProgress requires column %q, card is in %q", ColumnReview, c.Column)
	}
	c.Column = ColumnInProgress
	s.touch(&c)
	return c, nil
}

// SetPRUrl sets the PR URL; only allowed when the card is in Review.
func (s *Service) SetPRUrl(id, prUrl string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column != ColumnReview {
		return Card{}, fmt.Errorf("SetPRUrl requires column %q, card is in %q", ColumnReview, c.Column)
	}
	c.PRUrl = prUrl
	s.touch(&c)
	return c, nil
}

// MoveToDone transitions a card from Review → Done; requires a non-empty PRUrl.
func (s *Service) MoveToDone(id string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	if c.Column != ColumnReview {
		return Card{}, fmt.Errorf("MoveToDone requires column %q, card is in %q", ColumnReview, c.Column)
	}
	if c.PRUrl == "" {
		return Card{}, fmt.Errorf("MoveToDone requires a PR URL to be set first")
	}
	c.Column = ColumnDone
	s.touch(&c)
	return c, nil
}

// SetWorktree sets the worktree path and branch name on a card.
func (s *Service) SetWorktree(id, path, branch string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.WorktreePath = path
	c.BranchName = branch
	s.touch(&c)
	return c, nil
}

// SetModel validates model against agent.AllowedModels and persists it on
// the card. Returns an error containing "unknown model" when the id is not
// in the registry, or an error when the card cannot be found.
func (s *Service) SetModel(id, model string) (Card, error) {
	if !agent.IsAllowed(model) {
		return Card{}, fmt.Errorf("unknown model: %s", model)
	}
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.Model = model
	s.touch(&c)
	return c, nil
}

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
	s.touch(&c)
	return c, nil
}

// AppendMessage persists a message on a card.
func (s *Service) AppendMessage(cardID string, msg domain.Message) error {
	if !s.store.AppendMessage(cardID, msg) {
		return fmt.Errorf("card %q not found", cardID)
	}
	return nil
}

// ListMessages returns all persisted messages for a card in chronological
// order. Returns an empty (non-nil) slice when the card has no messages yet.
func (s *Service) ListMessages(cardID string) ([]domain.Message, error) {
	msgs, ok := s.store.ListMessages(cardID)
	if !ok {
		return nil, fmt.Errorf("card %q not found", cardID)
	}
	if msgs == nil {
		msgs = []domain.Message{}
	}
	return msgs, nil
}

// SetSessionID sets the agent session ID on a card.
func (s *Service) SetSessionID(id, sessionID string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.SessionID = sessionID
	s.touch(&c)
	return c, nil
}

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

// toStringSlice converts a value to []string, handling both []string (from Go callers)
// and []any (from JSON-decoded map[string]any).
func toStringSlice(v any) ([]string, bool) {
	switch val := v.(type) {
	case []string:
		return val, true
	case []any:
		out := make([]string, len(val))
		for i, item := range val {
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
