import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { SkillEditor } from "./SkillEditor";
import type { SkillItem } from "./types";

// Stub the Milkdown editor — JSDOM + Milkdown is flaky.
vi.mock("./SkillMarkdownEditor", () => ({
  SkillMarkdownEditor: ({ value, onChange, readOnly }: {
    value: string;
    onChange: (v: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="body"
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const item: SkillItem = {
  id: "1",
  kind: "skill",
  name: "alpha",
  description: "",
  source: "user",
  readOnly: false,
  path: "/a/SKILL.md",
};

describe("SkillEditor", () => {
  it("shows save button disabled when clean", () => {
    render(
      <SkillEditor
        item={item}
        frontmatter={{ name: "alpha" }}
        onFrontmatterChange={() => {}}
        body="hello"
        onBodyChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        onRevert={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("undo (cmd+z) restores previous body; redo (cmd+shift+z) reapplies", () => {
    function Wrapper() {
      const [body, setBody] = useState("one");
      return (
        <SkillEditor
          item={item}
          frontmatter={{ name: "alpha" }}
          onFrontmatterChange={() => {}}
          body={body}
          onBodyChange={setBody}
          isDirty={false}
          onSave={() => {}}
          onRevert={() => {}}
          onDelete={() => {}}
        />
      );
    }
    render(<Wrapper />);
    // Switch to raw mode so the undo handler is active.
    fireEvent.click(screen.getByRole("tab", { name: /show raw markdown/i }));
    const textarea = screen.getByLabelText("body") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "two" } });
    expect(textarea.value).toBe("two");
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("one");
    fireEvent.keyDown(textarea, { key: "z", metaKey: true, shiftKey: true });
    expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("two");
  });

  it("plugin item hides delete and shows read-only banner", () => {
    const plugin: SkillItem = { ...item, source: "plugin", readOnly: true, pluginName: "superpowers" };
    render(
      <SkillEditor
        item={plugin}
        frontmatter={{ name: "alpha" }}
        onFrontmatterChange={() => {}}
        body="hello"
        onBodyChange={() => {}}
        isDirty={false}
        onSave={() => {}}
        onRevert={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
