import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingBlock } from "./ThinkingBlock";
import type { ChatBlock } from "./chatStream";

function make(overrides: Partial<Extract<ChatBlock, { kind: "thinking" }>> = {}) {
  const base: Extract<ChatBlock, { kind: "thinking" }> = {
    kind: "thinking",
    index: 0,
    thinking: "Considering the tradeoffs",
    done: false,
    ...overrides,
  };
  return base;
}

describe("ThinkingBlock", () => {
  it("renders the thinking text", () => {
    render(<ThinkingBlock block={make({ thinking: "stepping through options" })} />);
    expect(screen.getByText(/stepping through options/i)).toBeInTheDocument();
  });

  it("shows a streaming indicator when not done", () => {
    render(<ThinkingBlock block={make({ done: false })} />);
    const group = screen.getByRole("group", { name: /thinking/i });
    expect(group).toHaveAttribute("data-streaming", "true");
  });

  it("marks the block as done when complete", () => {
    render(<ThinkingBlock block={make({ done: true })} />);
    const group = screen.getByRole("group", { name: /thinking/i });
    expect(group).toHaveAttribute("data-streaming", "false");
  });

  it("does not throw on empty text", () => {
    expect(() =>
      render(<ThinkingBlock block={make({ thinking: "", done: false })} />),
    ).not.toThrow();
    expect(screen.getByRole("group", { name: /thinking/i })).toBeInTheDocument();
  });
});
