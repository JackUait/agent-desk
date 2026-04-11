import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardContent } from "./CardContent";
import type { Card } from "../../shared/types/domain";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-abc12345-xyz",
    title: "Implement auth flow",
    description: "Add JWT-based authentication",
    column: "backlog",
    acceptanceCriteria: [],
    complexity: "",
    relevantFiles: [],
    sessionId: "",
    worktreePath: "",
    branchName: "",
    prUrl: "",
    createdAt: 1000,
    ...overrides,
  };
}

describe("CardContent", () => {
  const noop = () => {};

  it("renders title and description", () => {
    render(
      <CardContent card={makeCard()} onStart={noop} onApprove={noop} onMerge={noop} />,
    );
    expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByText("Add JWT-based authentication")).toBeInTheDocument();
  });

  it("shows status badge with formatted column name", () => {
    render(
      <CardContent
        card={makeCard({ column: "in_progress" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("shows card ID (first 8 chars)", () => {
    render(
      <CardContent card={makeCard()} onStart={noop} onApprove={noop} onMerge={noop} />,
    );
    expect(screen.getByText("card-abc")).toBeInTheDocument();
  });

  it("shows 'Start Development' button in backlog", () => {
    render(
      <CardContent card={makeCard()} onStart={noop} onApprove={noop} onMerge={noop} />,
    );
    expect(screen.getByRole("button", { name: "Start Development" })).toBeInTheDocument();
  });

  it("hides buttons in in_progress", () => {
    render(
      <CardContent
        card={makeCard({ column: "in_progress" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows 'Approve' button in review without prUrl", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows 'Merge' button in review with prUrl", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "https://github.com/pr/1" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
  });

  it("hides buttons in done", () => {
    render(
      <CardContent
        card={makeCard({ column: "done" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onStart when clicking Start Development", async () => {
    const onStart = vi.fn();
    render(
      <CardContent card={makeCard()} onStart={onStart} onApprove={noop} onMerge={noop} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start Development" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("calls onApprove when clicking Approve", async () => {
    const onApprove = vi.fn();
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "" })}
        onStart={noop}
        onApprove={onApprove}
        onMerge={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("calls onMerge when clicking Merge", async () => {
    const onMerge = vi.fn();
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "https://github.com/pr/1" })}
        onStart={noop}
        onApprove={noop}
        onMerge={onMerge}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it("renders acceptance criteria as list items", () => {
    render(
      <CardContent
        card={makeCard({ acceptanceCriteria: ["Must handle errors", "Must log events"] })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByText("Must handle errors")).toBeInTheDocument();
    expect(screen.getByText("Must log events")).toBeInTheDocument();
  });

  it("renders complexity tag", () => {
    render(
      <CardContent
        card={makeCard({ complexity: "medium" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByText("medium")).toBeInTheDocument();
  });

  it("renders relevant files in monospace", () => {
    render(
      <CardContent
        card={makeCard({ relevantFiles: ["src/main.ts"] })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("renders PR link as anchor", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "https://github.com/pr/1" })}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
      />,
    );
    const link = screen.getByRole("link", { name: /github\.com/ });
    expect(link).toHaveAttribute("href", "https://github.com/pr/1");
  });
});
