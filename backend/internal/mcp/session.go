package mcp

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// Sessions is a thread-safe in-memory token → cardID registry for scoping
// MCP tool calls to a single card per agent subprocess.
type Sessions struct {
	mu      sync.RWMutex
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
