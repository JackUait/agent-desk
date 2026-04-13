package agent_test

import (
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
)

func TestAllowedModels_OrderAndContents(t *testing.T) {
	got := agent.AllowedModels
	if len(got) != 3 {
		t.Fatalf("expected 3 allowed models, got %d", len(got))
	}
	want := []struct {
		id, label string
	}{
		{"claude-opus-4-6", "Opus 4.6"},
		{"claude-sonnet-4-6", "Sonnet 4.6"},
		{"claude-haiku-4-5", "Haiku 4.5"},
	}
	for i, w := range want {
		if got[i].ID != w.id {
			t.Errorf("AllowedModels[%d].ID = %q, want %q", i, got[i].ID, w.id)
		}
		if got[i].Label != w.label {
			t.Errorf("AllowedModels[%d].Label = %q, want %q", i, got[i].Label, w.label)
		}
	}
}

func TestIsAllowed(t *testing.T) {
	cases := []struct {
		id   string
		want bool
	}{
		{"claude-opus-4-6", true},
		{"claude-sonnet-4-6", true},
		{"claude-haiku-4-5", true},
		{"", false},
		{"bogus", false},
	}
	for _, c := range cases {
		if got := agent.IsAllowed(c.id); got != c.want {
			t.Errorf("IsAllowed(%q) = %v, want %v", c.id, got, c.want)
		}
	}
}
