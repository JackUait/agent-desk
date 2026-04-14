package card

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	"github.com/jackuait/agent-desk/backend/internal/domain"
)

type Store struct {
	mu       sync.RWMutex
	cards    map[string]Card
	messages map[string][]domain.Message
}

func NewStore() *Store {
	return &Store{
		cards:    make(map[string]Card),
		messages: make(map[string][]domain.Message),
	}
}

func (s *Store) Create(projectID, title string) Card {
	id := newID()
	c := Card{
		ID:                 id,
		ProjectID:          projectID,
		Title:              title,
		Column:             ColumnBacklog,
		AcceptanceCriteria: []string{},
		RelevantFiles:      []string{},
		CreatedAt:          time.Now().Unix(),
	}
	s.mu.Lock()
	s.cards[id] = c
	s.mu.Unlock()
	return c
}

func (s *Store) Get(id string) (Card, bool) {
	s.mu.RLock()
	c, ok := s.cards[id]
	s.mu.RUnlock()
	return c, ok
}

func (s *Store) List(projectID string) []Card {
	s.mu.RLock()
	out := make([]Card, 0, len(s.cards))
	for _, c := range s.cards {
		if c.ProjectID == projectID {
			out = append(out, c)
		}
	}
	s.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out
}

// ListAll returns every card across every project. Used only by admin/debug
// and the board aggregator. Prefer List(projectID) in normal code paths.
func (s *Store) ListAll() []Card {
	s.mu.RLock()
	out := make([]Card, 0, len(s.cards))
	for _, c := range s.cards {
		out = append(out, c)
	}
	s.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out
}

func (s *Store) DeleteByProject(projectID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for id, c := range s.cards {
		if c.ProjectID == projectID {
			delete(s.cards, id)
			delete(s.messages, id)
			count++
		}
	}
	return count
}

func (s *Store) Update(c Card) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.cards[c.ID]
	if !ok {
		return false
	}
	c.CreatedAt = existing.CreatedAt
	s.cards[c.ID] = c
	return true
}

func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.cards[id]
	if !ok {
		return false
	}
	delete(s.cards, id)
	delete(s.messages, id)
	return true
}

func (s *Store) AppendMessage(cardID string, msg domain.Message) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cards[cardID]; !ok {
		return false
	}
	s.messages[cardID] = append(s.messages[cardID], msg)
	return true
}

func (s *Store) ListMessages(cardID string) ([]domain.Message, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.cards[cardID]; !ok {
		return nil, false
	}
	out := make([]domain.Message, len(s.messages[cardID]))
	copy(out, s.messages[cardID])
	return out, true
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("card: failed to generate ID: " + err.Error())
	}
	return hex.EncodeToString(b)
}
