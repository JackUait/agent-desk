package websocket

import (
	"strings"
	"testing"

	"github.com/jackuait/agent-desk/backend/internal/agent"
	"github.com/jackuait/agent-desk/backend/internal/card"
)

func TestBuildAgentMessageWrapsDirty(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")
	_, _ = svc.UpdateFields(c.ID, map[string]any{"title": "new"})

	wrapped := buildAgentMessage(svc, c.ID, "do the thing", nil)
	if !strings.Contains(wrapped, "Title changed") {
		t.Fatalf("expected dirty block, got %q", wrapped)
	}
	if !strings.Contains(wrapped, "<user-message>\ndo the thing\n</user-message>") {
		t.Fatalf("expected user-message wrap, got %q", wrapped)
	}
}

func TestBuildAgentMessagePassthroughWhenClean(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")
	_, _ = svc.UpdateFieldsFromAgent(c.ID, map[string]any{"description": "As a user I want X so Y"})

	msg := buildAgentMessage(svc, c.ID, "hello", nil)
	if msg != "hello" {
		t.Fatalf("expected passthrough, got %q", msg)
	}
	_ = agent.AttachmentInfo{}
}

func TestBuildAgentMessageInjectsStoryReminderWhenDescriptionEmpty(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")

	msg := buildAgentMessage(svc, c.ID, "hello", nil)
	if !strings.Contains(msg, "<card-story-missing>") {
		t.Fatalf("expected story-missing block, got %q", msg)
	}
	if !strings.Contains(msg, "set_description") {
		t.Fatalf("expected set_description mention, got %q", msg)
	}
	if !strings.Contains(msg, "hello") {
		t.Fatalf("expected original message, got %q", msg)
	}
	if strings.Contains(msg, "<card-edits-since-last-turn>") {
		t.Fatalf("did not expect edits block, got %q", msg)
	}
}

func TestBuildAgentMessageNoReminderWhenDescriptionPresent(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")
	_, _ = svc.UpdateFieldsFromAgent(c.ID, map[string]any{"description": "As a user I want X so Y"})

	msg := buildAgentMessage(svc, c.ID, "hi", nil)
	if msg != "hi" {
		t.Fatalf("expected exact passthrough, got %q", msg)
	}
}

func TestBuildAgentMessageReminderCombinesWithDirtyEdits(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")
	_, _ = svc.UpdateFields(c.ID, map[string]any{"title": "new"})

	msg := buildAgentMessage(svc, c.ID, "do it", nil)
	if !strings.Contains(msg, "<card-story-missing>") {
		t.Fatalf("expected story-missing block, got %q", msg)
	}
	if !strings.Contains(msg, "<card-edits-since-last-turn>") {
		t.Fatalf("expected edits block, got %q", msg)
	}
	if !strings.Contains(msg, "Title changed") {
		t.Fatalf("expected Title changed, got %q", msg)
	}
	if !strings.Contains(msg, "do it") {
		t.Fatalf("expected user message, got %q", msg)
	}
}

func TestBuildAgentMessageIncludesAttachmentDetails(t *testing.T) {
	svc := card.NewService(card.NewStore())
	c := svc.CreateCard("p", "t")
	svc.RecordAttachmentAdded(c.ID, "spec.pdf")

	lookup := func(cardID, name string) (agent.AttachmentInfo, bool) {
		return agent.AttachmentInfo{Name: name, Size: 2048, MIMEType: "application/pdf"}, true
	}
	msg := buildAgentMessage(svc, c.ID, "hi", lookup)
	if !strings.Contains(msg, "Attached: spec.pdf (2 KB, application/pdf)") {
		t.Fatalf("missing attached detail: %q", msg)
	}
}

func TestBuildAgentMessageNonexistentCardSkipsReminder(t *testing.T) {
	svc := card.NewService(card.NewStore())

	msg := buildAgentMessage(svc, "nope-does-not-exist", "hi", nil)
	if msg != "hi" {
		t.Fatalf("expected pure passthrough for nonexistent card, got %q", msg)
	}
}
