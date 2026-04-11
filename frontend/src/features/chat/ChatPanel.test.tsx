import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "./ChatPanel";
import type { Message } from "../../shared/types/domain";

const messages: Message[] = [
  { id: "1", role: "user", content: "Hello agent", timestamp: 1000 },
  { id: "2", role: "assistant", content: "Hello user", timestamp: 2000 },
];

describe("ChatPanel", () => {
  it("renders the message list container", () => {
    render(<ChatPanel messages={[]} streamingContent="" onSend={vi.fn()} />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    render(<ChatPanel messages={[]} streamingContent="" onSend={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders all messages", () => {
    render(<ChatPanel messages={messages} streamingContent="" onSend={vi.fn()} />);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    expect(screen.getByText("Hello user")).toBeInTheDocument();
  });

  it("renders streaming content as an assistant bubble", () => {
    render(<ChatPanel messages={[]} streamingContent="partial response..." onSend={vi.fn()} />);
    expect(screen.getByText("partial response...")).toBeInTheDocument();
  });

  it("does not render a streaming bubble when streamingContent is empty", () => {
    render(<ChatPanel messages={messages} streamingContent="" onSend={vi.fn()} />);
    // Only the two real messages should appear — no extra "Agent" bubble for streaming
    expect(screen.getAllByText("Agent")).toHaveLength(1);
  });

  it("calls onSend with the input value and clears the input after send", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} streamingContent="" onSend={onSend} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "my message");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("my message");
    expect(input).toHaveValue("");
  });

  it("does not call onSend for blank input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} streamingContent="" onSend={onSend} />);

    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the input when readOnly is true", () => {
    render(<ChatPanel messages={[]} streamingContent="" onSend={vi.fn()} readOnly />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("disables the send button when readOnly is true", () => {
    render(<ChatPanel messages={[]} streamingContent="" onSend={vi.fn()} readOnly />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not call onSend when readOnly and form is submitted", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} streamingContent="" onSend={onSend} readOnly />);
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
