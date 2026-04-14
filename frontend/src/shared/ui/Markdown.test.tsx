import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders bold text as <strong>", () => {
    render(<Markdown>{"**bold**"}</Markdown>);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders inline code as <code>", () => {
    render(<Markdown>{"use `useMemo` here"}</Markdown>);
    expect(screen.getByText("useMemo").tagName).toBe("CODE");
  });

  it("renders fenced code block", () => {
    render(<Markdown>{"```\nconst x = 1;\n```"}</Markdown>);
    const code = screen.getByText(/const x = 1;/);
    expect(code.closest("pre")).not.toBeNull();
  });

  it("renders bullet lists", () => {
    render(<Markdown>{"- one\n- two"}</Markdown>);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("one");
  });

  it("renders links with safe target", () => {
    render(<Markdown>{"[claude](https://claude.ai)"}</Markdown>);
    const link = screen.getByRole("link", { name: "claude" });
    expect(link.getAttribute("href")).toBe("https://claude.ai");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders GFM task lists", () => {
    render(<Markdown>{"- [x] done\n- [ ] todo"}</Markdown>);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it("renders headings", () => {
    render(<Markdown>{"# Title"}</Markdown>);
    expect(screen.getByRole("heading", { name: "Title", level: 1 })).toBeInTheDocument();
  });

  it("sanitizes raw HTML (no script execution)", () => {
    const { container } = render(
      <Markdown>{"<script>window.__pwn=1</script>hello"}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
  });

  it("preserves hard line breaks in paragraphs", () => {
    const { container } = render(<Markdown>{"line one\nline two"}</Markdown>);
    expect(container.querySelector("p")).not.toBeNull();
    expect(container.textContent).toContain("line one");
    expect(container.textContent).toContain("line two");
  });
});
