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
