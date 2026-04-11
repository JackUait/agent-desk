package card

import (
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"
)

type Store struct {
	mu    sync.RWMutex
	cards map[string]Card
}

func NewStore() *Store {
	return &Store{
		cards: make(map[string]Card),
	}
}

func (s *Store) Create(title string) Card {
	id := newID()
	c := Card{
		ID:        id,
		Title:     title,
		Column:    ColumnBacklog,
		CreatedAt: time.Now().Unix(),
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

func (s *Store) List() []Card {
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
	return true
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("card: failed to generate ID: " + err.Error())
	}
	return hex.EncodeToString(b)
}
