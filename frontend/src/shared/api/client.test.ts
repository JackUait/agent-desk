import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";
import type { Board, Card } from "../types/domain";

const mockCard: Card = {
  id: "card-1",
  title: "Test card",
  description: "A test card",
  column: "backlog",
  acceptanceCriteria: [],
  complexity: "low",
  relevantFiles: [],
  sessionId: "",
  worktreePath: "",
  branchName: "",
  prUrl: "",
  createdAt: 1000,
  model: "",
};

const mockBoard: Board = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
  ],
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("api.createCard", () => {
  it("POSTs to /api/cards with the title and returns a card", async () => {
    globalThis.fetch = mockFetch(200, mockCard);
    const result = await api.createCard("Test card");
    expect(fetch).toHaveBeenCalledWith("/api/cards", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Test card" }),
    }));
    expect(result).toEqual(mockCard);
  });

  it("throws when the response is not ok", async () => {
    globalThis.fetch = mockFetch(500, { error: "internal error" });
    await expect(api.createCard("bad")).rejects.toThrow("internal error");
  });
});

describe("api.listCards", () => {
  it("GETs /api/cards and returns an array of cards", async () => {
    globalThis.fetch = mockFetch(200, [mockCard]);
    const result = await api.listCards();
    expect(fetch).toHaveBeenCalledWith("/api/cards", undefined);
    expect(result).toEqual([mockCard]);
  });
});

describe("api.getCard", () => {
  it("GETs /api/cards/:id and returns a card", async () => {
    globalThis.fetch = mockFetch(200, mockCard);
    const result = await api.getCard("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1", undefined);
    expect(result).toEqual(mockCard);
  });
});

describe("api.deleteCard", () => {
  it("DELETEs /api/cards/:id and returns undefined for 204", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: () => Promise.resolve(null),
    });
    const result = await api.deleteCard("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1", expect.objectContaining({
      method: "DELETE",
    }));
    expect(result).toBeUndefined();
  });
});

describe("api.mergeCard", () => {
  it("POSTs to /api/cards/:id/merge and returns the updated card", async () => {
    const merged = { ...mockCard, column: "done" as const };
    globalThis.fetch = mockFetch(200, merged);
    const result = await api.mergeCard("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1/merge", expect.objectContaining({
      method: "POST",
    }));
    expect(result).toEqual(merged);
  });
});

describe("api.getBoard", () => {
  it("GETs /api/board and returns the board", async () => {
    globalThis.fetch = mockFetch(200, mockBoard);
    const result = await api.getBoard();
    expect(fetch).toHaveBeenCalledWith("/api/board", undefined);
    expect(result).toEqual(mockBoard);
  });
});
