import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";

describe("ChatPanel", () => {
  it("renders the message list", () => {
    render(<ChatPanel />);
    expect(screen.getByTestId("message-list")).toBeInTheDocument();
  });

  it("renders the input area", () => {
    render(<ChatPanel />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
