import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardModal } from "./CardModal";
import type { Card, Message } from "../../shared/types/domain";

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

const messages: Message[] = [
  { id: "msg-1", role: "user", content: "Hello", timestamp: 1000 },
  { id: "msg-2", role: "assistant", content: "Hi there", timestamp: 1001 },
];

describe("CardModal", () => {
  const noop = () => {};

  it("renders card content and chat panel", () => {
    render(
      <CardModal
        card={makeCard()}
        messages={messages}
        streamingContent=""
        onSend={noop}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("calls onClose when clicking overlay", async () => {
    const onClose = vi.fn();
    render(
      <CardModal
        card={makeCard()}
        messages={messages}
        streamingContent=""
        onSend={noop}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking modal content", async () => {
    const onClose = vi.fn();
    render(
      <CardModal
        card={makeCard()}
        messages={messages}
        streamingContent=""
        onSend={noop}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByText("Implement auth flow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes readOnly to chat panel when card is done", () => {
    render(
      <CardModal
        card={makeCard({ column: "done" })}
        messages={[]}
        streamingContent=""
        onSend={noop}
        onStart={noop}
        onApprove={noop}
        onMerge={noop}
        onClose={noop}
      />,
    );
    const input = screen.getByLabelText("Message input");
    expect(input).toBeDisabled();
  });
});
