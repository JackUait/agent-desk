package card

import "fmt"

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) CreateCard(title string) Card {
	return s.store.Create(title)
}

func (s *Service) GetCard(id string) (Card, error) {
	c, ok := s.store.Get(id)
	if !ok {
		return Card{}, fmt.Errorf("card %q not found", id)
	}
	return c, nil
}

func (s *Service) ListCards() []Card {
	return s.store.List()
}

func (s *Service) DeleteCard(id string) error {
	if !s.store.Delete(id) {
		return fmt.Errorf("card %q not found", id)
	}
	return nil
}

// UpdateFields applies a partial update to allowed string and slice fields.
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
			if sl, ok := v.([]string); ok {
				c.AcceptanceCriteria = sl
			}
		case "relevantFiles":
			if sl, ok := v.([]string); ok {
				c.RelevantFiles = sl
			}
		}
	}
	s.store.Update(c)
	return c, nil
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
	s.store.Update(c)
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
	s.store.Update(c)
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
	s.store.Update(c)
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
	s.store.Update(c)
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
	s.store.Update(c)
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
	s.store.Update(c)
	return c, nil
}

// SetSessionID sets the agent session ID on a card.
func (s *Service) SetSessionID(id, sessionID string) (Card, error) {
	c, err := s.GetCard(id)
	if err != nil {
		return Card{}, err
	}
	c.SessionID = sessionID
	s.store.Update(c)
	return c, nil
}
