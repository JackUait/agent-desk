import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProjects } from "./use-projects";

vi.mock("../../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    renameProject: vi.fn(),
    deleteProject: vi.fn(),
    pickFolder: vi.fn(),
    listCards: vi.fn(),
    createCard: vi.fn(),
    getBoard: vi.fn(),
  },
}));

import { api } from "../../shared/api/client";

const mockedApi = api as unknown as {
  listProjects: ReturnType<typeof vi.fn>;
  createProject: ReturnType<typeof vi.fn>;
  renameProject: ReturnType<typeof vi.fn>;
  deleteProject: ReturnType<typeof vi.fn>;
  pickFolder: ReturnType<typeof vi.fn>;
  listCards: ReturnType<typeof vi.fn>;
  createCard: ReturnType<typeof vi.fn>;
  getBoard: ReturnType<typeof vi.fn>;
};

import type { Project } from "../../shared/types/domain";

const p = (id: string, title = id): Project => ({
  id,
  title,
  path: `/tmp/${id}`,
  colorIdx: 0,
  createdAt: 1,
});

const mockBoard = {
  id: "bd",
  title: "",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listProjects.mockResolvedValue([p("a"), p("b")]);
  mockedApi.getBoard.mockResolvedValue(mockBoard);
  mockedApi.listCards.mockResolvedValue([]);
});

describe("useProjects", () => {
  it("loads projects + per-project board + cards on mount", async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(2));
    expect(result.current.boardsByProject.a).toBeDefined();
    expect(result.current.cardsByProject.a).toBeDefined();
    expect(result.current.boardsByProject.b).toBeDefined();
    expect(result.current.cardsByProject.b).toBeDefined();
    expect(result.current.loading).toBe(false);
  });

  it("createProject triggers the picker and appends the project", async () => {
    mockedApi.pickFolder.mockResolvedValue({ path: "/tmp/c", cancelled: false });
    mockedApi.createProject.mockResolvedValue(p("c"));

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createProject();
    });

    expect(mockedApi.pickFolder).toHaveBeenCalledTimes(1);
    expect(mockedApi.createProject).toHaveBeenCalledWith("/tmp/c");
    expect(result.current.projects).toHaveLength(3);
    expect(result.current.boardsByProject.c).toBeDefined();
    expect(result.current.cardsByProject.c).toBeDefined();
  });

  it("createProject does nothing when picker is cancelled", async () => {
    mockedApi.pickFolder.mockResolvedValue({ path: "", cancelled: true });

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createProject();
    });

    expect(mockedApi.createProject).not.toHaveBeenCalled();
    expect(result.current.projects).toHaveLength(2);
  });

  it("renameProject updates the local title", async () => {
    mockedApi.renameProject.mockResolvedValue(p("a", "renamed"));

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.renameProject("a", "renamed");
    });

    const proj = result.current.projects.find((x) => x.id === "a");
    expect(proj?.title).toBe("renamed");
  });

  it("deleteProject removes project + cards + board", async () => {
    mockedApi.deleteProject.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteProject("a");
    });

    expect(result.current.projects.find((x) => x.id === "a")).toBeUndefined();
    expect(result.current.cardsByProject.a).toBeUndefined();
    expect(result.current.boardsByProject.a).toBeUndefined();
    expect(result.current.projects).toHaveLength(1);
  });

  it("createCardInProject inserts card into that project's backlog column", async () => {
    mockedApi.createCard.mockResolvedValue({
      id: "c1",
      projectId: "a",
      title: "new",
      description: "",
      column: "backlog",
      acceptanceCriteria: [],
      complexity: "",
      relevantFiles: [],
      sessionId: "",
      worktreePath: "",
      branchName: "",
      prUrl: "",
      createdAt: 2,
      model: "",
      labels: [],
      summary: "",
      blockedReason: "",
      progress: null,
      updatedAt: 0,
    });

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCardInProject("a", "new");
    });

    expect(result.current.cardsByProject.a?.c1).toBeDefined();
    const backlog = result.current.boardsByProject.a.columns.find(
      (col) => col.id === "col-backlog",
    );
    expect(backlog?.cardIds).toContain("c1");
  });

  it("createCardInProject appends to the bottom by default", async () => {
    mockedApi.getBoard.mockResolvedValue({
      ...mockBoard,
      columns: mockBoard.columns.map((c) =>
        c.id === "col-backlog" ? { ...c, cardIds: ["existing"] } : c,
      ),
    });
    mockedApi.createCard.mockResolvedValue({
      id: "c-new",
      projectId: "a",
      title: "new",
      description: "",
      column: "backlog",
      acceptanceCriteria: [],
      complexity: "",
      relevantFiles: [],
      sessionId: "",
      worktreePath: "",
      branchName: "",
      prUrl: "",
      createdAt: 2,
      model: "",
      labels: [],
      summary: "",
      blockedReason: "",
      progress: null,
      updatedAt: 0,
    });

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCardInProject("a", "new", "bottom");
    });

    const backlog = result.current.boardsByProject.a.columns.find(
      (col) => col.id === "col-backlog",
    );
    expect(backlog?.cardIds).toEqual(["existing", "c-new"]);
  });

  it("createCardInProject prepends to the top when position is 'top'", async () => {
    mockedApi.getBoard.mockResolvedValue({
      ...mockBoard,
      columns: mockBoard.columns.map((c) =>
        c.id === "col-backlog" ? { ...c, cardIds: ["existing"] } : c,
      ),
    });
    mockedApi.createCard.mockResolvedValue({
      id: "c-new",
      projectId: "a",
      title: "new",
      description: "",
      column: "backlog",
      acceptanceCriteria: [],
      complexity: "",
      relevantFiles: [],
      sessionId: "",
      worktreePath: "",
      branchName: "",
      prUrl: "",
      createdAt: 2,
      model: "",
      labels: [],
      summary: "",
      blockedReason: "",
      progress: null,
      updatedAt: 0,
    });

    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createCardInProject("a", "new", "top");
    });

    const backlog = result.current.boardsByProject.a.columns.find(
      (col) => col.id === "col-backlog",
    );
    expect(backlog?.cardIds).toEqual(["c-new", "existing"]);
  });
});
