import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextBlock } from "./TextBlock";
import type { ChatBlock } from "./chatStream";

function make(
  overrides: Partial<Extract<ChatBlock, { kind: "text" }>> = {},
): Extract<ChatBlock, { kind: "text" }> {
  return {
    kind: "text",
    index: 0,
    text: "Hello world",
    done: false,
    ...overrides,
  };
}

describe("TextBlock", () => {
  it("renders the prose text", () => {
    render(<TextBlock block={make({ text: "The cat sat on the mat." })} />);
    expect(screen.getByText("The cat sat on the mat.")).toBeInTheDocument();
  });

  it("shows a streaming caret when not done", () => {
    render(<TextBlock block={make({ done: false })} />);
    const el = screen.getByTestId("text-block");
    expect(el).toHaveAttribute("data-streaming", "true");
  });

  it("omits the streaming caret when done", () => {
    render(<TextBlock block={make({ done: true })} />);
    const el = screen.getByTestId("text-block");
    expect(el).toHaveAttribute("data-streaming", "false");
  });

  it("renders a markdown bulleted list as <li> elements", () => {
    const { container } = render(
      <TextBlock block={make({ text: "- one\n- two", done: true })} />,
    );
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("one");
    expect(items[1].textContent).toContain("two");
  });

  it("still renders the streaming caret alongside markdown when not done", () => {
    const { container } = render(
      <TextBlock block={make({ text: "- one", done: false })} />,
    );
    const el = screen.getByTestId("text-block");
    expect(el).toHaveAttribute("data-streaming", "true");
    // caret is an aria-hidden span sibling of the markdown
    const carets = container.querySelectorAll('span[aria-hidden="true"]');
    expect(carets.length).toBeGreaterThan(0);
  });
});
