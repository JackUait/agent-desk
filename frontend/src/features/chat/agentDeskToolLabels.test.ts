import { describe, it, expect } from "vitest";
import { labelForAgentDeskTool } from "./agentDeskToolLabels";

describe("labelForAgentDeskTool", () => {
  it("returns null for non-agent-desk tools", () => {
    expect(labelForAgentDeskTool("Bash", {})).toBeNull();
  });

  it("labels set_status", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_status", { column: "review" })).toBe(
      "Status → review",
    );
  });

  it("labels set_summary", () => {
    expect(
      labelForAgentDeskTool("mcp__agent_desk__set_summary", { summary: "refactoring auth" }),
    ).toBe("Summary: refactoring auth");
  });

  it("labels set_progress", () => {
    expect(
      labelForAgentDeskTool("mcp__agent_desk__set_progress", {
        step: 2,
        totalSteps: 5,
        currentStep: "writing tests",
      }),
    ).toBe("Progress: 2/5 writing tests");
  });

  it("labels add_label", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__add_label", { label: "bug" })).toBe("+Label bug");
  });

  it("labels remove_label", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__remove_label", { label: "bug" })).toBe(
      "−Label bug",
    );
  });

  it("labels set_blocked", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_blocked", { reason: "waiting" })).toBe(
      "Blocked: waiting",
    );
  });

  it("labels clear_blocked", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__clear_blocked", {})).toBe("Unblocked");
  });

  it("falls back to tool name for unknown agent-desk tools", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__set_title", { title: "x" })).toBe("Title: x");
  });

  it("returns short name for unknown-but-prefixed agent-desk tool", () => {
    expect(labelForAgentDeskTool("mcp__agent_desk__future_tool", {})).toBe("future_tool");
  });
});
