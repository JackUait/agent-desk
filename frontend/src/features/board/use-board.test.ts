import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBoard } from "./use-board";

describe("useBoard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial board with four columns", () => {
    const { result } = renderHook(() => useBoard());
    expect(result.current.board.columns).toHaveLength(4);
  });

  it("returns a cards map keyed by id", () => {
    const { result } = renderHook(() => useBoard());
    expect(result.current.cards["card-1"]).toBeDefined();
    expect(result.current.cards["card-1"].title).toBe("Set up CI pipeline");
  });

  it("moves a card from one column to another", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.moveCard("card-1", "col-backlog", "col-progress");
    });

    const backlog = result.current.board.columns.find((c) => c.id === "col-backlog")!;
    const progress = result.current.board.columns.find((c) => c.id === "col-progress")!;

    expect(backlog.cardIds).not.toContain("card-1");
    expect(progress.cardIds).toContain("card-1");
  });

  it("tracks entering cards after a move", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.moveCard("card-1", "col-backlog", "col-progress");
    });

    expect(result.current.enteringCards.has("card-1")).toBe(true);
  });

  it("tracks exiting cards during a move", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.startMove("card-1", "col-backlog", "col-progress");
    });

    expect(result.current.exitingCards.has("card-1")).toBe(true);

    vi.useRealTimers();
  });

  it("completes a two-phase move: exit then enter", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.startMove("card-1", "col-backlog", "col-progress");
    });

    expect(result.current.exitingCards.has("card-1")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.exitingCards.has("card-1")).toBe(false);
    expect(result.current.enteringCards.has("card-1")).toBe(true);

    const progress = result.current.board.columns.find((c) => c.id === "col-progress")!;
    expect(progress.cardIds).toContain("card-1");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.enteringCards.has("card-1")).toBe(false);
    vi.useRealTimers();
  });

  it("tracks working agents", () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      result.current.setAgentWorking("card-2", true);
    });

    expect(result.current.workingCards.has("card-2")).toBe(true);

    act(() => {
      result.current.setAgentWorking("card-2", false);
    });

    expect(result.current.workingCards.has("card-2")).toBe(false);
  });
});
