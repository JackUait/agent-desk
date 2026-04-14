import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EditableTitle } from "./EditableTitle";

describe("EditableTitle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders value as an editable field", () => {
    render(<EditableTitle value="hello" onChange={() => {}} />);
    const input = screen.getByDisplayValue("hello");
    expect(input).toBeInTheDocument();
  });

  it("auto-saves 500 ms after the last keystroke", () => {
    const onChange = vi.fn();
    render(<EditableTitle value="x" onChange={onChange} />);
    const input = screen.getByDisplayValue("x");
    fireEvent.change(input, { target: { value: "new title" } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(499));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledWith("new title");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately on blur", () => {
    const onChange = vi.fn();
    render(<EditableTitle value="x" onChange={onChange} />);
    const input = screen.getByDisplayValue("x");
    fireEvent.change(input, { target: { value: "b" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("does not fire onChange when value matches prop", () => {
    const onChange = vi.fn();
    render(<EditableTitle value="x" onChange={onChange} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange).not.toHaveBeenCalled();
  });
});
