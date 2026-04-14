import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectBoard } from "./ProjectBoard";
import type { Board, Card, Project } from "../../shared/types/domain";

const project: Project = {
  id: "p1",
  title: "alpha",
  path: "/tmp/alpha",
  colorIdx: 0,
  createdAt: 1,
};

const board: Board = {
  id: "b",
  title: "",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["c1"] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

const cards: Record<string, Card> = {
  c1: {
    id: "c1",
    projectId: "p1",
    title: "task",
    description: "",
    column: "backlog",
    acceptanceCriteria: [],
    complexity: "",
    relevantFiles: [],
    sessionId: "",
    worktreePath: "",
    branchName: "",
    prUrl: "",
    createdAt: 1,
    model: "",
    effort: "",
    labels: [],
    summary: "",
    blockedReason: "",
    progress: null,
    updatedAt: 0,
    attachments: [],
  },
};

describe("ProjectBoard", () => {
  it("renders the project header and all four columns", () => {
    render(
      <ProjectBoard
        project={project}
        board={board}
        cards={cards}
        onNewCard={vi.fn()}
        onRename={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    expect(screen.getByText("alpha")).toBeDefined();
    // "Backlog" also appears as a badge on the card, so use getAllByText
    expect(screen.getAllByText("Backlog").length).toBeGreaterThan(0);
    expect(screen.getByText("In Progress")).toBeDefined();
    expect(screen.getByText("Review")).toBeDefined();
    expect(screen.getByText("Done")).toBeDefined();
  });

  it("fires onNewCard with the project id", () => {
    const onNewCard = vi.fn();
    render(
      <ProjectBoard
        project={project}
        board={board}
        cards={cards}
        onNewCard={onNewCard}
        onRename={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new card/i }));
    expect(onNewCard).toHaveBeenCalledWith("p1");
  });

  it("fires onNewCard with 'top' when the backlog top + button is clicked", () => {
    const onNewCard = vi.fn();
    render(
      <ProjectBoard
        project={project}
        board={board}
        cards={cards}
        onNewCard={onNewCard}
        onRename={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add card to top/i }));
    expect(onNewCard).toHaveBeenCalledWith("p1", "top");
  });

  it("fires onNewCard with 'bottom' when the backlog 'Add a card' button is clicked", () => {
    const onNewCard = vi.fn();
    render(
      <ProjectBoard
        project={project}
        board={board}
        cards={cards}
        onNewCard={onNewCard}
        onRename={vi.fn()}
        onCardClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(onNewCard).toHaveBeenCalledWith("p1", "bottom");
  });
});
