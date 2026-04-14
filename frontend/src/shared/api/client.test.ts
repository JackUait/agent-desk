import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";
import type { Board, Card } from "../types/domain";

const mockCard: Card = {
  id: "card-1",
  projectId: "proj-1",
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
  it("POSTs to /api/cards with projectId and title and returns a card", async () => {
    globalThis.fetch = mockFetch(200, mockCard);
    const result = await api.createCard("proj-1", "new");
    expect(fetch).toHaveBeenCalledWith("/api/cards", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ projectId: "proj-1", title: "new" }),
    }));
    expect(result).toEqual(mockCard);
  });

  it("throws when the response is not ok", async () => {
    globalThis.fetch = mockFetch(500, { error: "internal error" });
    await expect(api.createCard("proj-1", "bad")).rejects.toThrow("internal error");
  });
});

describe("api.listCards", () => {
  it("GETs /api/cards?projectId=proj-1 and returns an array of cards", async () => {
    globalThis.fetch = mockFetch(200, [mockCard]);
    const result = await api.listCards("proj-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards?projectId=proj-1", undefined);
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

describe("api.listMessages", () => {
  it("GETs /api/cards/:id/messages and returns an array of messages", async () => {
    const messages = [
      { id: "m1", role: "user", content: "hi", timestamp: 1 },
      { id: "m2", role: "assistant", content: "hello", timestamp: 2 },
    ];
    globalThis.fetch = mockFetch(200, messages);
    const result = await api.listMessages("card-1");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-1/messages", undefined);
    expect(result).toEqual(messages);
  });

  it("returns an empty array for a card with no messages", async () => {
    globalThis.fetch = mockFetch(200, []);
    const result = await api.listMessages("card-empty");
    expect(fetch).toHaveBeenCalledWith("/api/cards/card-empty/messages", undefined);
    expect(result).toEqual([]);
  });
});

describe("api.getBoard", () => {
  it("GETs /api/projects/:projectId/board and returns the board", async () => {
    globalThis.fetch = mockFetch(200, mockBoard);
    const result = await api.getBoard("proj-1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/board", undefined);
    expect(result).toEqual(mockBoard);
  });
});

describe("api.listProjects", () => {
  it("GETs /api/projects", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "p1", title: "repo", path: "/tmp/repo", colorIdx: 0, createdAt: 1 }]),
    } as unknown as Response);
    const result = await api.listProjects();
    expect(fetch).toHaveBeenCalledWith("/api/projects", undefined);
    expect(result[0].id).toBe("p1");
  });
});

describe("api.createProject", () => {
  it("POSTs /api/projects with path", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "p1", title: "r", path: "/tmp/r", colorIdx: 0, createdAt: 1 }),
    } as unknown as Response);
    await api.createProject("/tmp/r");
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/tmp/r" }),
      }),
    );
  });
});

describe("api.renameProject", () => {
  it("PATCHes /api/projects/:id with title", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "p1", title: "new-name", path: "/tmp/r", colorIdx: 0, createdAt: 1 }),
    } as unknown as Response);
    const result = await api.renameProject("p1", "new-name");
    expect(fetch).toHaveBeenCalledWith(
      "/api/projects/p1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "new-name" }),
      }),
    );
    expect(result.title).toBe("new-name");
  });
});

describe("api.deleteProject", () => {
  it("DELETEs /api/projects/:id and returns undefined for 204", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: () => Promise.resolve(null),
    } as unknown as Response);
    const result = await api.deleteProject("p1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "DELETE" }));
    expect(result).toBeUndefined();
  });
});

describe("api.pickFolder", () => {
  it("POSTs /api/projects/pick-folder and returns result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ path: "/tmp/x", cancelled: false }),
    } as unknown as Response);
    const out = await api.pickFolder();
    expect(out).toEqual({ path: "/tmp/x", cancelled: false });
  });
});
