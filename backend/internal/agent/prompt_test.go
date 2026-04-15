package agent

import (
	"strings"
	"testing"
)

// TestAgentSystemPromptEnforcesUserStoryRule asserts the system prompt
// contains a strong, persistent rule telling the agent to ALWAYS keep the
// card title and description current as a human-readable user story, using
// the set_title and set_description tools at every meaningful turn.
func TestAgentSystemPromptEnforcesUserStoryRule(t *testing.T) {
	required := []string{
		"ALWAYS",
		"title",
		"description",
		"user story",
		"human-readable",
		"every meaningful turn",
	}

	lowered := strings.ToLower(agentSystemPrompt)

	var missing []string
	for _, sub := range required {
		if !strings.Contains(lowered, strings.ToLower(sub)) {
			missing = append(missing, sub)
		}
	}

	if len(missing) > 0 {
		t.Fatalf("agentSystemPrompt missing required substrings: %v\nprompt was:\n%s", missing, agentSystemPrompt)
	}
}

// TestAgentSystemPromptLocksCanonicalSentence locks the exact canonical
// phrasing of the user-story rule so drift cannot slip past shallow
// substring matching.
func TestAgentSystemPromptLocksCanonicalSentence(t *testing.T) {
	const canonical = "ALWAYS keep the card title and description reflecting the task as a human-readable user story"
	if !strings.Contains(agentSystemPrompt, canonical) {
		t.Fatalf("agentSystemPrompt missing canonical sentence %q\nprompt was:\n%s", canonical, agentSystemPrompt)
	}
}

// TestAgentSystemPromptBacklogCarveOut asserts the prompt explicitly tells
// the agent not to fabricate acceptance criteria during the Backlog phase.
func TestAgentSystemPromptBacklogCarveOut(t *testing.T) {
	const carveOut = "During Backlog, update incrementally as facts are confirmed; do not fabricate acceptance criteria before the user provides them."
	if !strings.Contains(agentSystemPrompt, carveOut) {
		t.Fatalf("agentSystemPrompt missing Backlog carve-out %q\nprompt was:\n%s", carveOut, agentSystemPrompt)
	}
}

// TestAgentSystemPromptUsesNamespacedToolNames asserts the user-story rule
// references the fully-namespaced MCP tool names, not bare identifiers.
func TestAgentSystemPromptUsesNamespacedToolNames(t *testing.T) {
	required := []string{
		"mcp__agent_desk__set_title",
		"mcp__agent_desk__set_description",
		"mcp__agent_desk__set_acceptance_criteria",
	}
	var missing []string
	for _, sub := range required {
		if !strings.Contains(agentSystemPrompt, sub) {
			missing = append(missing, sub)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("agentSystemPrompt missing namespaced tool names: %v\nprompt was:\n%s", missing, agentSystemPrompt)
	}
}
