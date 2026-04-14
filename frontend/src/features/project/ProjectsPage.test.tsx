import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectsPage } from "./ProjectsPage";
import { api } from "../../shared/api/client";

vi.mock("../../shared/api/client");
vi.mock("../chat", () => ({
  useModels: () => ({ models: [] }),
}));
vi.mock("../../shared/api/useCardSocket", () => ({
  useCardSocket: () => ({
    userMessages: [],
    chatStream: { blocks: [] },
    sendMessage: vi.fn(),
    sendAction: vi.fn(),
    cardUpdates: {},
    currentColumn: null,
    prUrl: "",
    worktreePath: "",
  }),
}));

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.mocked(api.listProjects).mockResolvedValue([]);
  });

  it("renders empty state when there are no projects", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByText(/pick a folder/i)).toBeDefined();
    });
  });

  it("renders a board section for each project", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
      { id: "b", title: "beta", path: "/tmp/b", colorIdx: 1, createdAt: 2 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue({
      id: "bd",
      title: "",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: [] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    });
    vi.mocked(api.listCards).mockResolvedValue([]);
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
      expect(screen.getAllByText("beta").length).toBeGreaterThan(0);
    });
  });
});
