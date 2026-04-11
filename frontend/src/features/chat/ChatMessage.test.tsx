import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessage } from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders a user message with label 'You'", () => {
    render(<ChatMessage role="user" content="Hello agent" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
  });

  it("renders an assistant message with label 'Agent'", () => {
    render(<ChatMessage role="assistant" content="Hello user" />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Hello user")).toBeInTheDocument();
  });

  it("renders streaming content instead of content when streaming prop is provided", () => {
    render(<ChatMessage role="assistant" content="full response" streaming="partial..." />);
    expect(screen.getByText("partial...")).toBeInTheDocument();
    expect(screen.queryByText("full response")).not.toBeInTheDocument();
  });

  it("renders content normally when streaming is undefined", () => {
    render(<ChatMessage role="user" content="my message" />);
    expect(screen.getByText("my message")).toBeInTheDocument();
  });

  it("applies the user CSS class for user role", () => {
    const { container } = render(<ChatMessage role="user" content="hi" />);
    expect(container.firstElementChild!.className).toMatch(/user/);
  });

  it("applies the assistant CSS class for assistant role", () => {
    const { container } = render(<ChatMessage role="assistant" content="hi" />);
    expect(container.firstElementChild!.className).toMatch(/assistant/);
  });
});
