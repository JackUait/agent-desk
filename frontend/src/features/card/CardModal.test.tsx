import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardModal } from "./CardModal";
import type { Card, Message, Model } from "../../shared/types/domain";
import { initialChatStreamState } from "../chat";

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
    model: "",
    ...overrides,
  };
}

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const messages: Message[] = [
  { id: "msg-1", role: "user", content: "Hello", timestamp: 1000 },
  { id: "msg-2", role: "assistant", content: "Hi there", timestamp: 1001 },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof CardModal>> = {}) {
  const props: React.ComponentProps<typeof CardModal> = {
    card: makeCard(),
    userMessages: messages,
    chatStream: initialChatStreamState,
    models: MODELS,
    onSend: vi.fn(),
    onStart: vi.fn(),
    onApprove: vi.fn(),
    onMerge: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<CardModal {...props} />);
}

describe("CardModal", () => {
  it("renders card content and chat panel", () => {
    renderModal();
    expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("renders the model chooser inside the modal", () => {
    renderModal();
    expect(screen.getByTestId("model-chooser")).toBeInTheDocument();
  });

  it("calls onClose when clicking overlay", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking modal content", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByText("Implement auth flow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes readOnly to chat panel when card is done", () => {
    renderModal({ card: makeCard({ column: "done" }), userMessages: [] });
    const input = screen.getByLabelText("Message input");
    expect(input).toBeDisabled();
  });
});
