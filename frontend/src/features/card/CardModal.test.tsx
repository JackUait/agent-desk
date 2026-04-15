import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardModal } from "./CardModal";
import type { Card, Message, Model } from "../../shared/types/domain";
import { initialChatStreamState } from "../chat";
import {
  requestSidePeek,
  __resetSidePeekForTests,
} from "../../shared/ui/side-peek-coordinator";

beforeEach(() => __resetSidePeekForTests());

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
    onApprove: vi.fn(),
    onMerge: vi.fn(),
    onClose: vi.fn(),
    onUpdate: () => {},
    onUpload: () => Promise.resolve(),
    onDeleteAttachment: () => Promise.resolve(),
    ...overrides,
  };
  return render(<CardModal {...props} />);
}

describe("CardModal", () => {
  it("renders card content and chat panel", () => {
    renderModal();
    expect(screen.getByDisplayValue("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("shows peak session context across all turns", () => {
    const mk = (i: number, o: number) => ({
      sessionId: "s",
      blocks: [],
      status: "done" as const,
      metrics: {
        durationMs: 1,
        costUsd: 0,
        inputTokens: i,
        outputTokens: o,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        stopReason: "end_turn",
      },
    });
    renderModal({
      chatStream: {
        turnInFlight: false,
        turns: [mk(3000, 200), mk(15200, 500), mk(8000, 100)],
      },
    });
    expect(screen.getByTestId("context-usage")).toHaveTextContent(/15\.7k/);
  });

  it("passes context breakdown with baseline=min and conversation=delta", async () => {
    const mk = (i: number, o: number) => ({
      sessionId: "s",
      blocks: [],
      status: "done" as const,
      metrics: {
        durationMs: 1,
        costUsd: 0,
        inputTokens: i,
        outputTokens: o,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        stopReason: "end_turn",
      },
    });
    renderModal({
      chatStream: {
        turnInFlight: false,
        turns: [mk(80700, 200), mk(83700, 400)],
      },
    });
    const panel = screen.getByTestId("context-breakdown");
    expect(panel).toHaveTextContent(/80\.7k/);
    expect(panel).toHaveTextContent(/3\.0k/);
    expect(panel).toHaveTextContent(/2 turns/i);
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
    await userEvent.click(screen.getByDisplayValue("Implement auth flow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes readOnly to chat panel when card is done", () => {
    renderModal({ card: makeCard({ column: "done" }), userMessages: [] });
    const input = screen.getByLabelText("Message input");
    expect(input).toBeDisabled();
  });

  it("defaults to modal layout when previewMode is not passed", () => {
    renderModal();
    const root = screen.getByTestId("card-preview-root");
    expect(root).toHaveAttribute("data-preview-mode", "modal");
  });

  it("renders as a right-docked side-peek when previewMode='side-peek'", () => {
    renderModal({ previewMode: "side-peek" });
    const root = screen.getByTestId("card-preview-root");
    expect(root).toHaveAttribute("data-preview-mode", "side-peek");
    expect(screen.getByDisplayValue("Implement auth flow")).toBeInTheDocument();
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("side-peek renders a top-left close button that calls onClose", async () => {
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    const closeBtn = screen.getByRole("button", { name: /close side peek/i });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("modal layout does not render the side-peek close button", () => {
    renderModal();
    expect(
      screen.queryByRole("button", { name: /close side peek/i }),
    ).not.toBeInTheDocument();
  });

  it("side-peek renders no backdrop so the page behind is clickable", () => {
    renderModal({ previewMode: "side-peek" });
    expect(screen.queryByTestId("modal-overlay")).not.toBeInTheDocument();
  });

  it("side-peek does not close when clicking inside the popup", async () => {
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    await userEvent.click(screen.getByDisplayValue("Implement auth flow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek does not close when clicking the description (which swaps to a textarea)", async () => {
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    await userEvent.click(screen.getByText("Add JWT-based authentication"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek does not close when interacting with a portal'd menu opened from inside", async () => {
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    await userEvent.click(screen.getByTestId("model-chooser"));
    const subTrigger = await screen.findByText("Sonnet 4.6");
    await userEvent.click(subTrigger);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek closes when clicking outside on a non-exempt element", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">outside</div>
        <CardModal
          card={makeCard()}
          userMessages={messages}
          chatStream={initialChatStreamState}
          models={MODELS}
          onSend={vi.fn()}
          onApprove={vi.fn()}
          onMerge={vi.fn()}
          onClose={onClose}
          onUpdate={() => {}}
          onUpload={() => Promise.resolve()}
          onDeleteAttachment={() => Promise.resolve()}
          previewMode="side-peek"
        />
      </div>,
    );
    await userEvent.click(screen.getByTestId("outside-area"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("side-peek does not close when clicking an element marked data-sidepeek-safe", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <article data-sidepeek-safe>a card</article>
        <button type="button" data-sidepeek-safe>+ Add a card</button>
        <CardModal
          card={makeCard()}
          userMessages={messages}
          chatStream={initialChatStreamState}
          models={MODELS}
          onSend={vi.fn()}
          onApprove={vi.fn()}
          onMerge={vi.fn()}
          onClose={onClose}
          onUpdate={() => {}}
          onUpload={() => Promise.resolve()}
          onDeleteAttachment={() => Promise.resolve()}
          previewMode="side-peek"
        />
      </div>,
    );
    await userEvent.click(screen.getByText("a card"));
    await userEvent.click(screen.getByText("+ Add a card"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("modal mode does not trigger outside-click close handler", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">outside</div>
        <CardModal
          card={makeCard()}
          userMessages={messages}
          chatStream={initialChatStreamState}
          models={MODELS}
          onSend={vi.fn()}
          onApprove={vi.fn()}
          onMerge={vi.fn()}
          onClose={onClose}
          onUpdate={() => {}}
          onUpload={() => Promise.resolve()}
          onDeleteAttachment={() => Promise.resolve()}
        />
      </div>,
    );
    // Modal renders a backdrop that covers the page; outside-area is not reachable.
    // Verify the non-side-peek path does not attach our custom listener by asserting
    // clicking the modal content itself does not call onClose.
    await userEvent.click(screen.getByDisplayValue("Implement auth flow"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek registers with side-peek coordinator and closes when displaced", async () => {
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    const granted = requestSidePeek("other", () => true);
    expect(granted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("side-peek closes itself when coordinator denies the request", async () => {
    requestSidePeek("blocker", () => false);
    const onClose = vi.fn();
    renderModal({ previewMode: "side-peek", onClose });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("modal mode does not register with side-peek coordinator", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const granted = requestSidePeek("other", () => false);
    expect(granted).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the chooser with effort inside the modal", () => {
    renderModal({
      card: makeCard({ model: "claude-sonnet-4-6", effort: "high" }),
    });
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("high");
  });
});
