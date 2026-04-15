import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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

const EMPTY_STREAM = initialChatStreamState;

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
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
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
  overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {},
) {
  const onSend = vi.fn();
  const utils = render(
    <ChatPanel
      userMessages={[]}
      chatStream={EMPTY_STREAM}
      models={MODELS}
      cardModel=""
      cardEffort=""
      onSend={onSend}
      {...overrides}
    />,
  );
  return { ...utils, onSend };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("ChatPanel basics", () => {
  it("renders the message list container", () => {
    renderPanel();
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    renderPanel();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders user messages", () => {
    const userMessages: Message[] = [
      { id: "1", role: "user", content: "Hello agent", timestamp: 1000 },
    ];
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
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
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

  it("does not call onSend for blank input", async () => {
    const user = userEvent.setup();
    const { onSend } = renderPanel();
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
    const { onSend } = renderPanel({ readOnly: true });
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("ChatPanel selection init priority", () => {
  it("uses cardModel + cardEffort when both non-empty", () => {
    renderPanel({ cardModel: "claude-sonnet-4-6", cardEffort: "high" });
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("high");
  });

  it("falls through to localStorage when cardEffort is empty", () => {
    window.localStorage.setItem(
      "agentDesk.lastSelection",
      JSON.stringify({ model: "claude-haiku-4-5", effort: "low" }),
    );
    renderPanel({ cardModel: "claude-sonnet-4-6", cardEffort: "" });
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Haiku 4.5");
    expect(trigger).toHaveTextContent("low");
  });

  it("migrates legacy lastModel key with medium default", () => {
    window.localStorage.setItem("agentDesk.lastModel", "claude-sonnet-4-6");
    renderPanel();
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("medium");
  });

  it("defaults to Opus 4.6 · medium when no prior", () => {
    renderPanel();
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Opus 4.6");
    expect(trigger).toHaveTextContent("medium");
  });
});

describe("ChatPanel send flow", () => {
  it("calls onSend(content, model, effort) and writes lastSelection", async () => {
    const user = userEvent.setup();
    const { onSend } = renderPanel({
      cardModel: "claude-haiku-4-5",
      cardEffort: "low",
    });

    await user.type(screen.getByLabelText("Message input"), "hi");
    await user.click(screen.getByTestId("send-button"));

    expect(onSend).toHaveBeenCalledWith("hi", "claude-haiku-4-5", "low");
    expect(window.localStorage.getItem("agentDesk.lastSelection")).toBe(
      JSON.stringify({ model: "claude-haiku-4-5", effort: "low" }),
    );
  });

  it("removes the legacy lastModel key on send", async () => {
    window.localStorage.setItem("agentDesk.lastModel", "claude-opus-4-6");
    const user = userEvent.setup();
    renderPanel({ cardModel: "claude-sonnet-4-6", cardEffort: "high" });
    await user.type(screen.getByLabelText("Message input"), "hi");
    await user.click(screen.getByTestId("send-button"));
    expect(window.localStorage.getItem("agentDesk.lastModel")).toBeNull();
  });

  it("disables chooser while turnInFlight", () => {
    renderPanel({ chatStream: { ...EMPTY_STREAM, turnInFlight: true } });
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });
});

describe("ChatPanel stop button", () => {
  it("shows Send and Stop side-by-side while turnInFlight", () => {
    renderPanel({
      chatStream: { ...EMPTY_STREAM, turnInFlight: true },
      onStop: vi.fn(),
    });
    expect(screen.getByTestId("send-button")).toBeInTheDocument();
    expect(screen.getByTestId("stop-button")).toBeInTheDocument();
  });

  it("keeps the Send button enabled so queued messages can be submitted mid-turn", async () => {
    const user = userEvent.setup();
    const { onSend } = renderPanel({
      chatStream: { ...EMPTY_STREAM, turnInFlight: true },
      onStop: vi.fn(),
      cardModel: "claude-haiku-4-5",
      cardEffort: "low",
    });
    await user.type(screen.getByLabelText("Message input"), "queued");
    await user.click(screen.getByTestId("send-button"));
    expect(onSend).toHaveBeenCalledWith("queued", "claude-haiku-4-5", "low");
  });

  it("calls onStop when the Stop button is clicked", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const { onSend } = renderPanel({
      chatStream: { ...EMPTY_STREAM, turnInFlight: true },
      onStop,
    });
    await user.click(screen.getByTestId("stop-button"));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("hides the Stop button when turnInFlight is false", () => {
    renderPanel({ chatStream: EMPTY_STREAM, onStop: vi.fn() });
    expect(screen.getByTestId("send-button")).toBeInTheDocument();
    expect(screen.queryByTestId("stop-button")).not.toBeInTheDocument();
  });
});

describe("ChatPanel card_update resync", () => {
  it("updates selection when cardModel or cardEffort changes", () => {
    const { rerender } = render(
      <ChatPanel
        userMessages={[]}
        chatStream={EMPTY_STREAM}
        models={MODELS}
        cardModel="claude-opus-4-6"
        cardEffort="medium"
        onSend={() => {}}
      />,
    );
    expect(screen.getByTestId("model-chooser")).toHaveTextContent("medium");

    rerender(
      <ChatPanel
        userMessages={[]}
        chatStream={EMPTY_STREAM}
        models={MODELS}
        cardModel="claude-opus-4-6"
        cardEffort="max"
        onSend={() => {}}
      />,
    );
    expect(screen.getByTestId("model-chooser")).toHaveTextContent("max");
  });
});
