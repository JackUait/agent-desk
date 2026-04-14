import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardContent } from "./CardContent";
import type { Card } from "../../shared/types/domain";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-abc12345-xyz",
    projectId: "test",
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
    model: "",
    effort: "",
    labels: [],
    summary: "",
    blockedReason: "",
    progress: null,
    updatedAt: 0,
    attachments: [],
    ...overrides,
  };
}

const noopCardHandlers = {
  onApprove: () => {},
  onMerge: () => {},
  onUpdate: () => {},
  onUpload: () => Promise.resolve(),
  onDeleteAttachment: () => Promise.resolve(),
};

describe("CardContent", () => {
  it("renders title and description", () => {
    render(
      <CardContent card={makeCard()} {...noopCardHandlers} />,
    );
    expect(screen.getByDisplayValue("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByText("Add JWT-based authentication")).toBeInTheDocument();
  });

  it("shows status badge with formatted column name", () => {
    render(
      <CardContent
        card={makeCard({ column: "in_progress" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("shows project title when provided", () => {
    render(
      <CardContent
        card={makeCard()}
        projectTitle="agent-desk"
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("agent-desk")).toBeInTheDocument();
    expect(screen.queryByText("card-abc")).not.toBeInTheDocument();
  });

  it("omits project label when projectTitle is missing", () => {
    render(
      <CardContent card={makeCard()} {...noopCardHandlers} />,
    );
    expect(screen.queryByText("card-abc")).not.toBeInTheDocument();
  });

  it("hides action buttons in backlog", () => {
    render(
      <CardContent card={makeCard()} {...noopCardHandlers} />,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("hides action buttons in in_progress", () => {
    render(
      <CardContent
        card={makeCard({ column: "in_progress" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("shows 'Approve' button in review without prUrl", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows 'Merge' button in review with prUrl", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "https://github.com/pr/1" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByRole("button", { name: "Merge" })).toBeInTheDocument();
  });

  it("hides action buttons in done", () => {
    render(
      <CardContent
        card={makeCard({ column: "done" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();
  });

  it("calls onApprove when clicking Approve", async () => {
    const onApprove = vi.fn();
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "" })}
        {...noopCardHandlers}
        onApprove={onApprove}
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
        {...noopCardHandlers}
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
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("Must handle errors")).toBeInTheDocument();
    expect(screen.getByText("Must log events")).toBeInTheDocument();
  });

  it("renders complexity tag", () => {
    render(
      <CardContent
        card={makeCard({ complexity: "medium" })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("medium")).toBeInTheDocument();
  });

  it("renders relevant files in monospace", () => {
    render(
      <CardContent
        card={makeCard({ relevantFiles: ["src/main.ts"] })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("renders description as GitHub-flavored markdown", () => {
    render(
      <CardContent
        card={makeCard({
          description: "**bold** and `code` and [link](https://example.com)",
        })}
        {...noopCardHandlers}
      />,
    );
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
    const code = screen.getByText("code");
    expect(code.tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders PR link as anchor", () => {
    render(
      <CardContent
        card={makeCard({ column: "review", prUrl: "https://github.com/pr/1" })}
        {...noopCardHandlers}
      />,
    );
    const link = screen.getByRole("link", { name: /github\.com/ });
    expect(link).toHaveAttribute("href", "https://github.com/pr/1");
  });

  it("calls onUpdate with new title after debounce", async () => {
    const onUpdate = vi.fn();
    vi.useFakeTimers();
    render(
      <CardContent
        card={makeCard()}
        {...noopCardHandlers}
        onUpdate={onUpdate}
      />,
    );
    const input = screen.getByDisplayValue("Implement auth flow");
    fireEvent.change(input, { target: { value: "new" } });
    vi.advanceTimersByTime(500);
    expect(onUpdate).toHaveBeenCalledWith({ title: "new" });
    vi.useRealTimers();
  });

  it("renders attachment list from card", () => {
    render(
      <CardContent
        card={makeCard({
          attachments: [
            { name: "a.txt", size: 10, mimeType: "text/plain", uploadedAt: 1 },
          ],
        })}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText(/a\.txt/)).toBeInTheDocument();
  });
});

describe("CardContent new fields", () => {
  const base = makeCard({
    id: "c1",
    title: "t",
    description: "d",
    column: "in_progress",
  });

  it("renders summary when present", () => {
    render(<CardContent card={{ ...base, summary: "refactoring auth" }} {...noopCardHandlers} />);
    expect(screen.getByText("refactoring auth")).toBeInTheDocument();
  });

  it("hides summary when empty", () => {
    render(<CardContent card={{ ...base, summary: "" }} {...noopCardHandlers} />);
    expect(screen.queryByText("refactoring auth")).not.toBeInTheDocument();
  });

  it("renders progress bar when progress set", () => {
    render(
      <CardContent
        card={{ ...base, progress: { step: 2, totalSteps: 4, currentStep: "tests" } }}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("renders blocked status region when reason set", () => {
    render(
      <CardContent
        card={{ ...base, blockedReason: "needs schema" }}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByRole("status", { name: /blocked.*needs schema/i })).toBeInTheDocument();
  });

  it("renders label chips", () => {
    render(
      <CardContent
        card={{ ...base, labels: ["bug", "urgent"] }}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders relative updatedAt when set", () => {
    const now = Math.floor(Date.now() / 1000);
    render(
      <CardContent
        card={{ ...base, updatedAt: now - 30 }}
        {...noopCardHandlers}
      />,
    );
    expect(screen.getByTestId("updated-at")).toHaveTextContent(/updated\s+\d+s\s+ago/);
  });
});
