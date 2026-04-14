import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectHeader } from "./ProjectHeader";

const base = {
  id: "p1",
  title: "alpha",
  path: "/tmp/alpha",
  colorIdx: 0,
  createdAt: 1710000000,
};

describe("ProjectHeader", () => {
  it("renders the project title and metadata", () => {
    render(<ProjectHeader project={base} cardCount={5} onRename={vi.fn()} />);
    expect(screen.getByText("alpha")).toBeDefined();
    expect(screen.getByText(/5 cards/i)).toBeDefined();
  });

  it("enters edit mode on double-click and fires onRename on Enter", () => {
    const onRename = vi.fn();
    render(<ProjectHeader project={base} cardCount={5} onRename={onRename} />);
    fireEvent.doubleClick(screen.getByText("alpha"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("renamed");
  });

  it("cancels edit on Escape without firing onRename", () => {
    const onRename = vi.fn();
    render(<ProjectHeader project={base} cardCount={5} onRename={onRename} />);
    fireEvent.doubleClick(screen.getByText("alpha"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("alpha")).toBeDefined();
  });
});
