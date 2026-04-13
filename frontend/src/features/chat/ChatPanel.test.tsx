import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type { Message, Model } from "../../shared/types/domain";
import type { ChatStreamState } from "./chatStream";
import { initialChatStreamState } from "./chatStream";

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const userMessages: Message[] = [
  { id: "1", role: "user", content: "Hello agent", timestamp: 1000 },
];

function streamWithText(text: string, done = true): ChatStreamState {
  return {
    turns: [
      {
        sessionId: "s1",
        blocks: [{ kind: "text", index: 0, text, done }],
        status: done ? "done" : "streaming",
        ...(done
          ? {
              metrics: {
                durationMs: 1234,
                costUsd: 0.0123,
                inputTokens: 10,
                outputTokens: 42,
                stopReason: "end_turn",
              },
            }
          : {}),
      },
    ],
    turnInFlight: !done,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof ChatPanel>> = {},
) {
  const defaultProps: React.ComponentProps<typeof ChatPanel> = {
    userMessages: [],
    chatStream: initialChatStreamState,
    onSend: vi.fn(),
    models: MODELS,
    cardModel: "",
  };
  return render(<ChatPanel {...defaultProps} {...props} />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ChatPanel", () => {
  it("renders the message list container", () => {
    renderPanel();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    renderPanel();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders user messages", () => {
    renderPanel({ userMessages });
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
  });

  it("renders a text block from the chat stream", () => {
    renderPanel({ chatStream: streamWithText("Hi from the model") });
    expect(screen.getByText("Hi from the model")).toBeInTheDocument();
    expect(screen.getByTestId("text-block")).toBeInTheDocument();
  });

  it("renders thinking and tool_use blocks in insertion order", () => {
    const chatStream: ChatStreamState = {
      turns: [
        {
          sessionId: "s1",
          status: "streaming",
          blocks: [
            { kind: "thinking", index: 0, thinking: "Planning...", done: true },
            {
              kind: "tool_use",
              index: 1,
              toolId: "tu-1",
              toolName: "Read",
              partialJson: '{"path":"x"}',
              done: false,
            },
          ],
        },
      ],
      turnInFlight: true,
    };
    renderPanel({ chatStream });
    const list = screen.getByTestId("message-list");
    const thinking = within(list).getByTestId("thinking-block");
    const tool = within(list).getByTestId("tool-use-block");
    expect(thinking).toBeInTheDocument();
    expect(tool).toBeInTheDocument();
    expect(
      thinking.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("interleaves user messages with assistant turns in order", () => {
    const chatStream: ChatStreamState = {
      turns: [
        {
          sessionId: "s1",
          status: "done",
          blocks: [{ kind: "text", index: 0, text: "First answer", done: true }],
          metrics: {
            durationMs: 500,
            costUsd: 0.001,
            inputTokens: 1,
            outputTokens: 2,
            stopReason: "end_turn",
          },
        },
      ],
      turnInFlight: false,
    };
    const msgs: Message[] = [
      { id: "u1", role: "user", content: "First question", timestamp: 1 },
    ];
    renderPanel({ userMessages: msgs, chatStream });
    const list = screen.getByTestId("message-list");
    const userEl = within(list).getByText("First question");
    const asstEl = within(list).getByText("First answer");
    expect(
      userEl.compareDocumentPosition(asstEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the metrics footer only when the last turn is done with metrics", () => {
    renderPanel({ chatStream: streamWithText("done text", true) });
    expect(screen.getByTestId("turn-metrics")).toBeInTheDocument();
  });

  it("hides the metrics footer when the last turn is still streaming", () => {
    renderPanel({ chatStream: streamWithText("still typing", false) });
    expect(screen.queryByTestId("turn-metrics")).not.toBeInTheDocument();
  });

  it("shows the streaming indicator when the last turn is streaming", () => {
    renderPanel({ chatStream: streamWithText("part", false) });
    expect(screen.getByTestId("turn-streaming")).toBeInTheDocument();
  });

  it("calls onSend with the input value and selected model, then clears the input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderPanel({ onSend, cardModel: "claude-opus-4-6" });
    const input = screen.getByRole("textbox");
    await user.type(input, "my message");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("my message", "claude-opus-4-6");
    expect(input).toHaveValue("");
  });

  it("does not call onSend for blank input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderPanel({ onSend });
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the input when readOnly is true", () => {
    renderPanel({ readOnly: true });
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables the send button when readOnly is true", () => {
    renderPanel({ readOnly: true });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not call onSend when readOnly and form is submitted", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderPanel({ readOnly: true, onSend });
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  // ---- Model chooser integration ----

  it("initialises selectedModel from cardModel when non-empty", () => {
    renderPanel({ cardModel: "claude-sonnet-4-6" });
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-sonnet-4-6");
  });

  it("falls back to localStorage when cardModel is empty", () => {
    window.localStorage.setItem("agentDesk.lastModel", "claude-haiku-4-5");
    renderPanel({ cardModel: "" });
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-haiku-4-5");
  });

  it("ignores a localStorage model that is not in the models list", () => {
    window.localStorage.setItem("agentDesk.lastModel", "claude-fake");
    renderPanel({ cardModel: "" });
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-opus-4-6");
  });

  it("falls back to claude-opus-4-6 when cardModel empty and no localStorage", () => {
    renderPanel({ cardModel: "" });
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-opus-4-6");
  });

  it("disables the model chooser while turnInFlight is true", () => {
    const chatStream: ChatStreamState = {
      turns: [],
      turnInFlight: true,
    };
    renderPanel({ chatStream });
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });

  it("passes the newly-selected model on the next send", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderPanel({ onSend, cardModel: "claude-opus-4-6" });
    const select = screen.getByTestId("model-chooser");
    await user.selectOptions(select, "claude-haiku-4-5");
    const input = screen.getByRole("textbox");
    await user.type(input, "hi");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("hi", "claude-haiku-4-5");
  });

  it("writes the latest selected model to localStorage after send", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderPanel({ onSend, cardModel: "claude-opus-4-6" });
    const select = screen.getByTestId("model-chooser");
    await user.selectOptions(select, "claude-sonnet-4-6");
    const input = screen.getByRole("textbox");
    await user.type(input, "hi");
    await user.keyboard("{Enter}");
    expect(window.localStorage.getItem("agentDesk.lastModel")).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("re-syncs selectedModel when cardModel prop changes", () => {
    const { rerender } = renderPanel({ cardModel: "claude-opus-4-6" });
    rerender(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
        models={MODELS}
        cardModel="claude-sonnet-4-6"
      />,
    );
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-sonnet-4-6");
  });
});
