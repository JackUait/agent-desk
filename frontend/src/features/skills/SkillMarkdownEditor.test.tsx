import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillMarkdownEditor } from "./SkillMarkdownEditor";

describe("SkillMarkdownEditor", () => {
  it("raw toggle shows a textarea that edits the value", () => {
    const onChange = vi.fn();
    render(<SkillMarkdownEditor value="hello" onChange={onChange} readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: /raw/i }));
    const textarea = screen.getByLabelText("raw markdown") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    fireEvent.change(textarea, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalledWith("world");
  });

  it("readOnly disables raw textarea", () => {
    render(<SkillMarkdownEditor value="hello" onChange={() => {}} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: /raw/i }));
    expect(screen.getByLabelText("raw markdown")).toBeDisabled();
  });
});
