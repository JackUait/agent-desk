import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "./KanbanCard";
import type { Card } from "../../shared/types/domain";

const card: Card = {
  id: "card-1",
  projectId: "test",
  title: "Set up CI pipeline",
  description: "Configure GitHub Actions",
  column: "backlog",
  acceptanceCriteria: [],
  complexity: "",
  relevantFiles: [],
  sessionId: "",
  worktreePath: "",
  branchName: "",
  prUrl: "",
  createdAt: 1000,
  model: "",
  effort: "",
  labels: [],
  summary: "",
  blockedReason: "",
  progress: null,
  updatedAt: 0,
  attachments: [],
};

describe("KanbanCard", () => {
  it("renders the card title", () => {
    render(<KanbanCard card={card} />);
    expect(screen.getByText("Set up CI pipeline")).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<KanbanCard card={card} />);
    expect(screen.getByText("Configure GitHub Actions")).toBeInTheDocument();
  });

  it("applies entering class when isEntering is true", () => {
    const { container } = render(<KanbanCard card={card} isEntering />);
    expect(container.firstElementChild!.classList.toString()).toContain("entering");
  });

  it("applies exiting class when isExiting is true", () => {
    const { container } = render(<KanbanCard card={card} isExiting />);
    expect(container.firstElementChild!.classList.toString()).toContain("exiting");
  });

  it("applies working class when isWorking is true", () => {
    const { container } = render(<KanbanCard card={card} isWorking />);
    expect(container.firstElementChild!.classList.toString()).toContain("working");
  });

  it("shows status indicator for working agent", () => {
    render(<KanbanCard card={card} isWorking />);
    expect(screen.getByTestId("agent-status")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<KanbanCard card={card} onClick={onClick} />);
    await userEvent.click(screen.getByText("Set up CI pipeline"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

function makeCard(overrides: Partial<Card> = {}): Card {
  return { ...card, ...overrides };
}

describe("KanbanCard new fields", () => {
  it("renders summary as secondary line", () => {
    const c = makeCard({ title: "t", summary: "refactoring auth" });
    render(<KanbanCard card={c} />);
    expect(screen.getByText("refactoring auth")).toBeInTheDocument();
  });

  it("renders label chips", () => {
    const c = makeCard({ title: "t", labels: ["bug"] });
    render(<KanbanCard card={c} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("renders thin progress bar when progress set", () => {
    const c = makeCard({ title: "t", progress: { step: 1, totalSteps: 3, currentStep: "x" } });
    render(<KanbanCard card={c} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders blocked dot when reason set", () => {
    const c = makeCard({ title: "t", blockedReason: "stuck" });
    render(<KanbanCard card={c} />);
    expect(screen.getByTestId("blocked-dot")).toBeInTheDocument();
  });
});
