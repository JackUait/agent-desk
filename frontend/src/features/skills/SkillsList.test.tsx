import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillsList } from "./SkillsList";
import type { SkillItem } from "./types";

const items: SkillItem[] = [
  { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a" },
  { id: "2", kind: "skill", name: "beta", description: "", source: "plugin", pluginName: "superpowers", readOnly: true, path: "/b" },
];

describe("SkillsList", () => {
  it("groups user and plugin items and calls onSelect", () => {
    const onSelect = vi.fn();
    render(
      <SkillsList
        items={items}
        kind="skill"
        selectedPath={null}
        onSelect={onSelect}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Plugin: superpowers")).toBeInTheDocument();

    fireEvent.click(screen.getByText("alpha"));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("filters by query", () => {
    render(
      <SkillsList
        items={items}
        kind="skill"
        selectedPath={null}
        onSelect={() => {}}
        query="bet"
        onQueryChange={() => {}}
      />,
    );
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });
});
