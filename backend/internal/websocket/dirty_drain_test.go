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

	msg := buildAgentMessage(svc, c.ID, "hello", nil)
	if msg != "hello" {
		t.Fatalf("expected passthrough, got %q", msg)
	}
	_ = agent.AttachmentInfo{}
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
