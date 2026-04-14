import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Column } from "./Column";
import type { Card, Column as ColumnType } from "../../shared/types/domain";

const cards: Record<string, Card> = {
  "card-1": {
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
  },
  "card-2": {
    id: "card-2",
    projectId: "test",
    title: "Design auth flow",
    description: "Token-based auth",
    column: "backlog",
    acceptanceCriteria: [],
    complexity: "",
    relevantFiles: [],
    sessionId: "",
    worktreePath: "",
    branchName: "",
    prUrl: "",
    createdAt: 1001,
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

const column: ColumnType = {
  id: "col-backlog",
  title: "Backlog",
  cardIds: ["card-1", "card-2"],
};

describe("Column", () => {
  it("renders the column title", () => {
    render(<Column column={column} cards={cards} />);
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument();
  });

  it("renders the card count", () => {
    render(<Column column={column} cards={cards} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders all cards in the column", () => {
    render(<Column column={column} cards={cards} />);
    expect(screen.getByText("Set up CI pipeline")).toBeInTheDocument();
    expect(screen.getByText("Design auth flow")).toBeInTheDocument();
  });

  it("renders empty column", () => {
    const empty: ColumnType = { id: "col-done", title: "Done", cardIds: [] };
    render(<Column column={empty} cards={cards} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders top and bottom add buttons when onAddCard is provided", () => {
    render(<Column column={column} cards={cards} onAddCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add card to top/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add a card/i })).toBeInTheDocument();
  });

  it("does not render add buttons when onAddCard is omitted", () => {
    render(<Column column={column} cards={cards} />);
    expect(screen.queryByRole("button", { name: /add card to top/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add a card/i })).toBeNull();
  });

  it("invokes onAddCard with 'top' when the top button is clicked", () => {
    const onAddCard = vi.fn();
    render(<Column column={column} cards={cards} onAddCard={onAddCard} />);
    fireEvent.click(screen.getByRole("button", { name: /add card to top/i }));
    expect(onAddCard).toHaveBeenCalledWith("top");
  });

  it("invokes onAddCard with 'bottom' when the bottom button is clicked", () => {
    const onAddCard = vi.fn();
    render(<Column column={column} cards={cards} onAddCard={onAddCard} />);
    fireEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(onAddCard).toHaveBeenCalledWith("bottom");
  });

  it("passes animation state to cards", () => {
    const entering = new Set(["card-1"]);
    const { container } = render(
      <Column column={column} cards={cards} enteringCards={entering} />,
    );
    const articles = container.querySelectorAll("article");
    expect(articles[0].classList.toString()).toContain("entering");
    expect(articles[1].classList.toString()).not.toContain("entering");
  });
});
