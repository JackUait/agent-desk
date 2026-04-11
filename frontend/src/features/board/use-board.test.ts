import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBoard } from "./use-board";
import type { Board, Card } from "../../shared/types/domain";

const TEST_CARDS: Record<string, Card> = {
  "card-1": {
    id: "card-1",
    title: "Set up CI pipeline",
    description: "Configure GitHub Actions",
    status: "backlog",
    agentName: "DevOps-1",
    messages: [],
  },
  "card-2": {
    id: "card-2",
    title: "Design auth flow",
    description: "Token-based auth",
    status: "in-progress",
    agentName: "Architect-1",
    messages: [],
  },
};

const TEST_BOARD: Board = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-2"] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

describe("useBoard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial board with four columns", () => {
    const { result } = renderHook(() => useBoard());
    expect(result.current.board.columns).toHaveLength(4);
  });

  it("returns a cards map keyed by id", () => {
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));
    expect(result.current.cards["card-1"]).toBeDefined();
    expect(result.current.cards["card-1"].title).toBe("Set up CI pipeline");
  });

  it("moves a card from one column to another", () => {
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));

    act(() => {
      result.current.moveCard("card-1", "col-backlog", "col-progress");
    });

    const backlog = result.current.board.columns.find((c) => c.id === "col-backlog")!;
    const progress = result.current.board.columns.find((c) => c.id === "col-progress")!;

    expect(backlog.cardIds).not.toContain("card-1");
    expect(progress.cardIds).toContain("card-1");
  });

  it("tracks entering cards after a move", () => {
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));

    act(() => {
      result.current.moveCard("card-1", "col-backlog", "col-progress");
    });

    expect(result.current.enteringCards.has("card-1")).toBe(true);
  });

  it("tracks exiting cards during a move", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));

    act(() => {
      result.current.startMove("card-1", "col-backlog", "col-progress");
    });

    expect(result.current.exitingCards.has("card-1")).toBe(true);

    vi.useRealTimers();
  });

  it("completes a two-phase move: exit then enter", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));

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
    const { result } = renderHook(() => useBoard(TEST_BOARD, TEST_CARDS));

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
