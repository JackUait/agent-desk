import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the prompt and the picker CTA", () => {
    render(<EmptyState onPickFolder={vi.fn()} />);
    expect(screen.getByText(/pick a folder/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /choose folder/i })).toBeDefined();
  });

  it("fires onPickFolder when the CTA is clicked", () => {
    const onPick = vi.fn();
    render(<EmptyState onPickFolder={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /choose folder/i }));
    expect(onPick).toHaveBeenCalled();
  });
});
