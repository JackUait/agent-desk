import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillMarkdownEditor } from "./SkillMarkdownEditor";

describe("SkillMarkdownEditor", () => {
  it("raw mode shows a textarea that edits the value", () => {
    const onChange = vi.fn();
    render(<SkillMarkdownEditor value="hello" onChange={onChange} readOnly={false} raw />);
    const textarea = screen.getByLabelText("raw markdown") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    fireEvent.change(textarea, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalledWith("world");
  });

  it("readOnly disables raw textarea", () => {
    render(<SkillMarkdownEditor value="hello" onChange={() => {}} readOnly raw />);
    expect(screen.getByLabelText("raw markdown")).toBeDisabled();
  });
});
