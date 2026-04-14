package agent

import (
	"strings"
	"testing"
)

func TestWrapPassthroughWhenClean(t *testing.T) {
	got := WrapUserMessage("hello", nil, nil, nil)
	if got != "hello" {
		t.Fatalf("want unchanged, got %q", got)
	}
}

func TestWrapTitleFlag(t *testing.T) {
	got := WrapUserMessage("hi", []string{"title"}, nil, nil)
	if !strings.Contains(got, "<card-edits-since-last-turn>") {
		t.Fatalf("missing tag: %q", got)
	}
	if !strings.Contains(got, "- Title changed") {
		t.Fatalf("missing title line: %q", got)
	}
	if !strings.Contains(got, "<user-message>\nhi\n</user-message>") {
		t.Fatalf("missing user-message wrapper: %q", got)
	}
}

func TestWrapDescriptionFlag(t *testing.T) {
	got := WrapUserMessage("hi", []string{"description"}, nil, nil)
	if !strings.Contains(got, "- Description changed") {
		t.Fatalf("missing description line: %q", got)
	}
}

func TestWrapAttachmentDiff(t *testing.T) {
	added := []AttachmentInfo{
		{Name: "spec.pdf", Size: 21000, MIMEType: "application/pdf"},
	}
	removed := []string{"old.txt"}
	got := WrapUserMessage("msg", []string{"attachments"}, added, removed)
	if !strings.Contains(got, "- Attached: spec.pdf (21 KB, application/pdf)") {
		t.Fatalf("missing attached line: %q", got)
	}
	if !strings.Contains(got, "- Removed: old.txt") {
		t.Fatalf("missing removed line: %q", got)
	}
}

func TestWrapStableFlagOrder(t *testing.T) {
	got := WrapUserMessage("m", []string{"attachments", "description", "title"}, nil, nil)
	idxTitle := strings.Index(got, "Title changed")
	idxDesc := strings.Index(got, "Description changed")
	idxAtt := strings.Index(got, "Attachments changed")
	if idxTitle == -1 || idxDesc == -1 || idxAtt == -1 {
		t.Fatalf("all three lines must appear: %q", got)
	}
	if !(idxTitle < idxDesc && idxDesc < idxAtt) {
		t.Fatalf("order wrong, want title < description < attachments. got %q", got)
	}
}
