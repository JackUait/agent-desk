import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type { Message } from "../../shared/types/domain";
import type { ChatStreamState } from "./chatStream";
import { initialChatStreamState } from "./chatStream";

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
  };
}

describe("ChatPanel", () => {
  it("renders the message list container", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders user messages", () => {
    render(
      <ChatPanel
        userMessages={userMessages}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
  });

  it("renders a text block from the chat stream", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={streamWithText("Hi from the model")}
        onSend={vi.fn()}
      />,
    );
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
    };
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={chatStream}
        onSend={vi.fn()}
      />,
    );
    const list = screen.getByTestId("message-list");
    const thinking = within(list).getByTestId("thinking-block");
    const tool = within(list).getByTestId("tool-use-block");
    expect(thinking).toBeInTheDocument();
    expect(tool).toBeInTheDocument();
    // Ordering: thinking comes before tool_use in the DOM
    expect(thinking.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    };
    const msgs: Message[] = [
      { id: "u1", role: "user", content: "First question", timestamp: 1 },
    ];
    render(
      <ChatPanel userMessages={msgs} chatStream={chatStream} onSend={vi.fn()} />,
    );
    const list = screen.getByTestId("message-list");
    const userEl = within(list).getByText("First question");
    const asstEl = within(list).getByText("First answer");
    expect(
      userEl.compareDocumentPosition(asstEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the metrics footer only when the last turn is done with metrics", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={streamWithText("done text", true)}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId("turn-metrics")).toBeInTheDocument();
  });

  it("hides the metrics footer when the last turn is still streaming", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={streamWithText("still typing", false)}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("turn-metrics")).not.toBeInTheDocument();
  });

  it("shows the streaming indicator when the last turn is streaming", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={streamWithText("part", false)}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByTestId("turn-streaming")).toBeInTheDocument();
  });

  it("calls onSend with the input value and clears the input after send", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={onSend}
      />,
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "my message");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("my message");
    expect(input).toHaveValue("");
  });

  it("does not call onSend for blank input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={onSend}
      />,
    );
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the input when readOnly is true", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
        readOnly
      />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables the send button when readOnly is true", () => {
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={vi.fn()}
        readOnly
      />,
    );
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not call onSend when readOnly and form is submitted", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ChatPanel
        userMessages={[]}
        chatStream={initialChatStreamState}
        onSend={onSend}
        readOnly
      />,
    );
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
