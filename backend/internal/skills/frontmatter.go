package skills

import (
	"sort"
	"strings"
)

// SplitFrontmatter extracts a leading flat "key: value" frontmatter block.
func SplitFrontmatter(content string) (map[string]string, string) {
	fm := map[string]string{}
	if !strings.HasPrefix(content, "---\n") {
		return fm, content
	}
	rest := content[len("---\n"):]
	end := strings.Index(rest, "\n---\n")
	if end == -1 {
		return fm, content
	}
	block := rest[:end]
	body := rest[end+len("\n---\n"):]
	for _, line := range strings.Split(block, "\n") {
		if line == "" {
			continue
		}
		idx := strings.Index(line, ":")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if key != "" {
			fm[key] = val
		}
	}
	return fm, body
}

// AssembleFrontmatter serialises a deterministic frontmatter block + body.
func AssembleFrontmatter(fm map[string]string, body string) string {
	if len(fm) == 0 {
		return body
	}
	keys := make([]string, 0, len(fm))
	for k := range fm {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("---\n")
	for _, k := range keys {
		b.WriteString(k)
		b.WriteString(": ")
		b.WriteString(fm[k])
		b.WriteString("\n")
	}
	b.WriteString("---\n")
	b.WriteString(body)
	return b.String()
}
