import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Column } from "./Column";
import type { Card, Column as ColumnType } from "../../shared/types/domain";

const cards: Record<string, Card> = {
  "card-1": {
    id: "card-1",
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
  },
  "card-2": {
    id: "card-2",
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
