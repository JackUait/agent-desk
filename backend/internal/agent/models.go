package agent

// Model describes a Claude model selectable per-card.
type Model struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// AllowedModels is the hardcoded registry of selectable Claude models.
// Order is user-facing (first entry is the default fallback).
var AllowedModels = []Model{
	{ID: "claude-opus-4-6", Label: "Opus 4.6"},
	{ID: "claude-sonnet-4-6", Label: "Sonnet 4.6"},
	{ID: "claude-haiku-4-5", Label: "Haiku 4.5"},
}

// IsAllowed reports whether id matches one of the AllowedModels entries.
// Empty string is not allowed.
func IsAllowed(id string) bool {
	if id == "" {
		return false
	}
	for _, m := range AllowedModels {
		if m.ID == id {
			return true
		}
	}
	return false
}

// AllowedEfforts is the hardcoded list of thinking effort levels the Claude
// CLI accepts via its --effort flag. Order is user-facing.
var AllowedEfforts = []string{"low", "medium", "high", "max"}

// IsAllowedEffort reports whether e is one of AllowedEfforts. The empty
// string is not allowed (empty means "no effort override, use CLI default").
func IsAllowedEffort(e string) bool {
	if e == "" {
		return false
	}
	for _, x := range AllowedEfforts {
		if x == e {
			return true
		}
	}
	return false
}
