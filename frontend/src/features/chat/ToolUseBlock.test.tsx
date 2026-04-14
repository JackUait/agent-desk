import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolUseBlock } from "./ToolUseBlock";
import type { ChatBlock } from "./chatStream";

function make(
  overrides: Partial<Extract<ChatBlock, { kind: "tool_use" }>> = {},
): Extract<ChatBlock, { kind: "tool_use" }> {
  return {
    kind: "tool_use",
    index: 0,
    toolId: "tool-1",
    toolName: "Read",
    partialJson: '{"path":"/tmp/x"}',
    done: false,
    ...overrides,
  };
}

describe("ToolUseBlock", () => {
  it("renders the tool name in the header", () => {
    render(<ToolUseBlock block={make({ toolName: "Grep" })} />);
    expect(screen.getByText("Grep")).toBeInTheDocument();
  });

  it("renders the partial JSON input", () => {
    render(<ToolUseBlock block={make({ partialJson: '{"pattern":"foo"}' })} />);
    expect(screen.getByText(/"pattern":"foo"/)).toBeInTheDocument();
  });

  it("status dot is labelled as running when not done", () => {
    render(<ToolUseBlock block={make({ done: false })} />);
    expect(screen.getByLabelText(/running/i)).toBeInTheDocument();
  });

  it("status dot is labelled as completed when done", () => {
    render(<ToolUseBlock block={make({ done: true })} />);
    expect(screen.getByLabelText(/completed/i)).toBeInTheDocument();
  });

  it("status dot is labelled as error when result is an error", () => {
    render(
      <ToolUseBlock
        block={make({
          done: true,
          result: { content: "boom", isError: true },
        })}
      />,
    );
    expect(screen.getByLabelText(/error/i)).toBeInTheDocument();
  });

  it("renders the tool result pane when result is present", () => {
    render(
      <ToolUseBlock
        block={make({
          done: true,
          result: { content: "file contents here", isError: false },
        })}
      />,
    );
    expect(screen.getByTestId("tool-result")).toBeInTheDocument();
    expect(screen.getByText(/file contents here/)).toBeInTheDocument();
  });

  it("omits the tool result pane when result is undefined", () => {
    render(<ToolUseBlock block={make({ result: undefined })} />);
    expect(screen.queryByTestId("tool-result")).not.toBeInTheDocument();
  });
});

describe("ToolUseBlock agent-desk relabel", () => {
  it("renders semantic label instead of raw tool name for agent-desk tools", () => {
    const block = {
      kind: "tool_use" as const,
      toolId: "x",
      toolName: "mcp__agent_desk__set_status",
      partialJson: JSON.stringify({ column: "review" }),
      done: true,
      result: undefined,
    };
    render(<ToolUseBlock block={block as any} />);
    expect(screen.getByText("Status → review")).toBeInTheDocument();
  });

  it("falls back to raw tool name for non-agent-desk tools", () => {
    const block = {
      kind: "tool_use" as const,
      toolId: "x",
      toolName: "Bash",
      partialJson: JSON.stringify({ command: "ls" }),
      done: true,
      result: undefined,
    };
    render(<ToolUseBlock block={block as any} />);
    expect(screen.getByText("Bash")).toBeInTheDocument();
  });
});
