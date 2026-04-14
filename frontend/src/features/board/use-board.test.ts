import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBoard } from "./use-board";

vi.mock("../../shared/api/client", () => ({
  api: {
    getBoard: vi.fn(),
    listCards: vi.fn(),
    createCard: vi.fn(),
  },
}));

import { api } from "../../shared/api/client";

const mockedApi = api as unknown as {
  getBoard: ReturnType<typeof vi.fn>;
  listCards: ReturnType<typeof vi.fn>;
  createCard: ReturnType<typeof vi.fn>;
};

const BOARD = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

const CARDS = [
  {
    id: "card-1",
    projectId: "test",
    title: "Test card",
    description: "",
    column: "backlog" as const,
    acceptanceCriteria: [],
    complexity: "",
    relevantFiles: [],
    sessionId: "",
    worktreePath: "",
    branchName: "",
    prUrl: "",
    createdAt: 1000,
    model: "",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getBoard.mockResolvedValue(BOARD);
  mockedApi.listCards.mockResolvedValue(CARDS);
});

describe("useBoard", () => {
  it("returns 4 columns after loading", async () => {
    const { result } = renderHook(() => useBoard());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.board.columns).toHaveLength(4);
  });

  it("populates cards map from API", async () => {
    const { result } = renderHook(() => useBoard());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.cards["card-1"]).toBeDefined();
    expect(result.current.cards["card-1"].title).toBe("Test card");
  });

  it("creates a card and adds it to backlog", async () => {
    const newCard = {
      id: "card-new",
      projectId: "test",
      title: "New card",
      description: "",
      column: "backlog" as const,
      acceptanceCriteria: [],
      complexity: "",
      relevantFiles: [],
      sessionId: "",
      worktreePath: "",
      branchName: "",
      prUrl: "",
      createdAt: 2000,
      model: "",
    };
    mockedApi.createCard.mockResolvedValue(newCard);

    const { result } = renderHook(() => useBoard());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createCard("New card");
    });

    expect(result.current.cards["card-new"]).toBeDefined();
    const backlog = result.current.board.columns.find((c) => c.id === "col-backlog")!;
    expect(backlog.cardIds).toContain("card-new");
  });

  it("selects a card", async () => {
    const { result } = renderHook(() => useBoard());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.selectCard("card-1");
    });
    expect(result.current.selectedCardId).toBe("card-1");

    act(() => {
      result.current.selectCard(null);
    });
    expect(result.current.selectedCardId).toBeNull();
  });

  it("updates a card", async () => {
    const { result } = renderHook(() => useBoard());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateCard({ ...CARDS[0], title: "Updated" });
    });
    expect(result.current.cards["card-1"].title).toBe("Updated");
  });
});
