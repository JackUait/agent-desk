import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KanbanCard } from "./KanbanCard";
import type { Card } from "../../shared/types/domain";

const card: Card = {
  id: "card-1",
  title: "Set up CI pipeline",
  description: "Configure GitHub Actions",
  status: "backlog",
  agentName: "DevOps-1",
  messages: [],
};

describe("KanbanCard", () => {
  it("renders the card title", () => {
    render(<KanbanCard card={card} />);
    expect(screen.getByText("Set up CI pipeline")).toBeInTheDocument();
  });

  it("renders the agent name", () => {
    render(<KanbanCard card={card} />);
    expect(screen.getByText("DevOps-1")).toBeInTheDocument();
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
});
