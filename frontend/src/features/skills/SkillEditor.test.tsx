import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
