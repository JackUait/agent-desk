import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EditableDescription } from "./EditableDescription";

describe("EditableDescription", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows rendered markdown when unfocused", () => {
    render(<EditableDescription value="# hi" onChange={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: "hi" })).toBeInTheDocument();
  });

  it("switches to textarea on click and returns rendered markdown on blur", () => {
    const onChange = vi.fn();
    render(<EditableDescription value="hello" onChange={onChange} />);

    fireEvent.click(screen.getByText("hello"));
    const area = screen.getByRole("textbox");
    fireEvent.change(area, { target: { value: "updated" } });
    fireEvent.blur(area);
    expect(onChange).toHaveBeenCalledWith("updated");
  });

  it("editing textarea has no visible chrome and matches preview min-height", () => {
    render(<EditableDescription value="hello" onChange={() => {}} />);
    fireEvent.click(screen.getByText("hello"));
    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(area.className).not.toMatch(/border-border-input/);
    expect(area.className).not.toMatch(/\brounded\b/);
    expect(area.className).toMatch(/min-h-\[48px\]/);
  });

  it("debounces 500ms during typing", () => {
    const onChange = vi.fn();
    render(<EditableDescription value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("a"));
    const area = screen.getByRole("textbox");
    fireEvent.change(area, { target: { value: "b" } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
