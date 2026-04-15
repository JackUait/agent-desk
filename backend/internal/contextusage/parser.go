package contextusage

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Usage is a parsed snapshot of `claude -p /context` output.
type Usage struct {
	TotalTokens               int `json:"totalTokens"`
	ContextWindowTokens       int `json:"contextWindowTokens"`
	SystemPromptTokens        int `json:"systemPromptTokens"`
	SystemToolsTokens         int `json:"systemToolsTokens"`
	McpToolsTokens            int `json:"mcpToolsTokens"`
	SystemToolsDeferredTokens int `json:"systemToolsDeferredTokens"`
	CustomAgentsTokens        int `json:"customAgentsTokens"`
	MemoryFilesTokens         int `json:"memoryFilesTokens"`
	SkillsTokens              int `json:"skillsTokens"`
	MessagesTokens            int `json:"messagesTokens"`
	FreeSpaceTokens           int `json:"freeSpaceTokens"`
	AutocompactBufferTokens   int `json:"autocompactBufferTokens"`
}

var (
	tokensHeaderRe = regexp.MustCompile(`(?m)^\*\*Tokens:\*\*\s+([0-9.]+[kKmM]?)\s*/\s*([0-9.]+[kKmM]?)`)
	categoryRowRe  = regexp.MustCompile(`^\|\s*([^|]+?)\s*\|\s*([0-9.]+[kKmM]?)\s*\|`)
)

// Parse extracts Usage from the markdown output of the Claude Code `/context`
// slash command. It requires the "Estimated usage by category" table to be
// present; otherwise it returns an error.
func Parse(md string) (Usage, error) {
	var u Usage
	sawCategory := false

	if m := tokensHeaderRe.FindStringSubmatch(md); m != nil {
		u.TotalTokens = parseTokenCount(m[1])
		u.ContextWindowTokens = parseTokenCount(m[2])
	}

	for _, line := range strings.Split(md, "\n") {
		m := categoryRowRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		label := strings.ToLower(strings.TrimSpace(m[1]))
		if label == "category" {
			continue
		}
		value := parseTokenCount(m[2])
		switch label {
		case "system prompt":
			u.SystemPromptTokens = value
			sawCategory = true
		case "system tools":
			u.SystemToolsTokens = value
			sawCategory = true
		case "mcp tools", "mcp tools (deferred)":
			u.McpToolsTokens = value
			sawCategory = true
		case "system tools (deferred)":
			u.SystemToolsDeferredTokens = value
			sawCategory = true
		case "custom agents":
			u.CustomAgentsTokens = value
			sawCategory = true
		case "memory files":
			u.MemoryFilesTokens = value
			sawCategory = true
		case "skills":
			u.SkillsTokens = value
			sawCategory = true
		case "messages":
			u.MessagesTokens = value
			sawCategory = true
		case "free space":
			u.FreeSpaceTokens = value
			sawCategory = true
		case "autocompact buffer":
			u.AutocompactBufferTokens = value
			sawCategory = true
		}
	}

	if !sawCategory {
		return Usage{}, errors.New("contextusage: no category rows found in markdown")
	}
	return u, nil
}

func parseTokenCount(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	mult := 1.0
	last := s[len(s)-1]
	switch last {
	case 'k', 'K':
		mult = 1_000
		s = s[:len(s)-1]
	case 'm', 'M':
		mult = 1_000_000
		s = s[:len(s)-1]
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return int(math.Round(f * mult))
}
