package agent

import (
	"fmt"
	"sort"
	"strings"
)

// AttachmentInfo is the minimal set of attachment fields the wrapper needs.
// Declared here so internal/agent doesn't import internal/attachment.
type AttachmentInfo struct {
	Name     string
	Size     int64
	MIMEType string
}

// WrapUserMessage decorates a raw user chat message with a block describing
// what the user changed on the card since the last agent turn. It returns
// the original message unchanged when there is nothing to announce.
func WrapUserMessage(msg string, flags []string, added []AttachmentInfo, removed []string) string {
	if len(flags) == 0 && len(added) == 0 && len(removed) == 0 {
		return msg
	}

	lines := make([]string, 0, len(flags)+len(added)+len(removed))
	set := make(map[string]bool, len(flags))
	for _, f := range flags {
		set[f] = true
	}

	// Stable, human-friendly order.
	if set["title"] {
		lines = append(lines, "- Title changed")
	}
	if set["description"] {
		lines = append(lines, "- Description changed")
	}
	if set["attachments"] || len(added) > 0 || len(removed) > 0 {
		lines = append(lines, "- Attachments changed")
	}

	// Sort added deterministically.
	sort.Slice(added, func(i, j int) bool { return added[i].Name < added[j].Name })
	for _, a := range added {
		lines = append(lines, fmt.Sprintf("- Attached: %s (%s, %s)", a.Name, humanSize(a.Size), a.MIMEType))
	}
	removedCopy := append([]string(nil), removed...)
	sort.Strings(removedCopy)
	for _, r := range removedCopy {
		lines = append(lines, "- Removed: "+r)
	}

	var b strings.Builder
	b.WriteString("<card-edits-since-last-turn>\n")
	b.WriteString(strings.Join(lines, "\n"))
	b.WriteString("\n</card-edits-since-last-turn>\n\n")
	b.WriteString("<user-message>\n")
	b.WriteString(msg)
	b.WriteString("\n</user-message>")
	return b.String()
}

func humanSize(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1024*1024:
		return fmt.Sprintf("%d KB", (n+512)/1024)
	default:
		return fmt.Sprintf("%d MB", n/(1024*1024))
	}
}
