package contextusage

import "testing"

const sampleMarkdown = `## Context Usage

**Model:** claude-opus-4-6[1m]
**Tokens:** 20.3k / 1m (2%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 6.8k | 0.7% |
| System tools | 7.4k | 0.7% |
| MCP tools (deferred) | 809 | 0.1% |
| System tools (deferred) | 12.7k | 1.3% |
| Custom agents | 296 | 0.0% |
| Memory files | 845 | 0.1% |
| Skills | 2.9k | 0.3% |
| Messages | 2.1k | 0.2% |
| Free space | 946.7k | 94.7% |
| Autocompact buffer | 33k | 3.3% |
`

func TestParse_ExtractsCategoriesFromMarkdownTable(t *testing.T) {
	u, err := Parse(sampleMarkdown)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}

	cases := []struct {
		name string
		got  int
		want int
	}{
		{"SystemPrompt", u.SystemPromptTokens, 6800},
		{"SystemTools", u.SystemToolsTokens, 7400},
		{"McpTools", u.McpToolsTokens, 809},
		{"SystemToolsDeferred", u.SystemToolsDeferredTokens, 12700},
		{"CustomAgents", u.CustomAgentsTokens, 296},
		{"MemoryFiles", u.MemoryFilesTokens, 845},
		{"Skills", u.SkillsTokens, 2900},
		{"Messages", u.MessagesTokens, 2100},
		{"FreeSpace", u.FreeSpaceTokens, 946700},
		{"AutocompactBuffer", u.AutocompactBufferTokens, 33000},
		{"Total", u.TotalTokens, 20300},
		{"ContextWindow", u.ContextWindowTokens, 1_000_000},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s = %d, want %d", c.name, c.got, c.want)
		}
	}
}

func TestParse_HandlesRawInteger(t *testing.T) {
	md := `**Tokens:** 500 / 200k (0%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 180 | 0.1% |
`
	u, err := Parse(md)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if u.TotalTokens != 500 {
		t.Errorf("TotalTokens = %d, want 500", u.TotalTokens)
	}
	if u.ContextWindowTokens != 200_000 {
		t.Errorf("ContextWindowTokens = %d, want 200000", u.ContextWindowTokens)
	}
	if u.SystemPromptTokens != 180 {
		t.Errorf("SystemPromptTokens = %d, want 180", u.SystemPromptTokens)
	}
}

func TestParse_MissingTableReturnsError(t *testing.T) {
	if _, err := Parse("no tables here"); err == nil {
		t.Error("expected error for missing category table, got nil")
	}
}
