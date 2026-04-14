import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectSidebar } from "./ProjectSidebar";
import type { Project } from "../../shared/types/domain";

vi.mock("../skills/SkillsDialog", () => ({
  SkillsDialog: ({ open, scope }: { open: boolean; scope: { kind: string; projectId?: string } }) =>
    open ? <div data-testid={`dialog-${scope.projectId}`} /> : null,
}));

const projects: Project[] = [
  { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
  { id: "b", title: "beta", path: "/tmp/b", colorIdx: 1, createdAt: 2 },
];

describe("ProjectSidebar", () => {
  it("renders every project title", () => {
    render(
      <ProjectSidebar projects={projects} activeId="a" onNewProject={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("alpha")).toBeDefined();
    expect(screen.getByText("beta")).toBeDefined();
  });

  it("fires onSelect with project id when an entry is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ProjectSidebar projects={projects} activeId="a" onNewProject={vi.fn()} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("beta"));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("fires onNewProject when the footer button is clicked", () => {
    const onNew = vi.fn();
    render(
      <ProjectSidebar projects={projects} activeId={null} onNewProject={onNew} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("marks the active entry with data-active", () => {
    render(
      <ProjectSidebar projects={projects} activeId="b" onNewProject={vi.fn()} onSelect={vi.fn()} />,
    );
    const activeEntry = screen.getByText("beta").closest("[data-active]");
    expect(activeEntry?.getAttribute("data-active")).toBe("true");
  });
});

describe("ProjectSidebar skills button", () => {
  it("opens project-scoped skills dialog", () => {
    render(
      <ProjectSidebar
        projects={[{ id: "p1", title: "One", path: "/p1", colorIdx: 0, createdAt: 0 }]}
        activeId={null}
        onNewProject={() => {}}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /skills for one/i }));
    expect(screen.getByTestId("dialog-p1")).toBeInTheDocument();
  });
});
