import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectsPage } from "./ProjectsPage";
import { api } from "../../shared/api/client";
import { SETTINGS_STORAGE_KEY } from "../settings";
import { __resetSettingsForTests } from "../settings/use-settings";
import type { Card } from "../../shared/types/domain";

vi.mock("../../shared/api/client");
vi.mock("../chat", async () => {
  const actual = await vi.importActual<typeof import("../chat")>("../chat");
  return {
    ...actual,
    useModels: () => ({ models: [] }),
  };
});
vi.mock("../../shared/api/useCardSocket", () => ({
  useCardSocket: () => ({
    userMessages: [],
    chatStream: { turns: [], turnInFlight: false },
    sendMessage: vi.fn(),
    sendAction: vi.fn(),
    cardUpdates: {},
    currentColumn: null,
    prUrl: "",
    worktreePath: "",
  }),
}));

const newCard: Card = {
  id: "new-card",
  projectId: "a",
  title: "New Card",
  description: "",
  column: "backlog",
  acceptanceCriteria: [],
  complexity: "",
  relevantFiles: [],
  sessionId: "",
  worktreePath: "",
  branchName: "",
  prUrl: "",
  createdAt: 99,
  model: "",
  effort: "",
  labels: [],
  summary: "",
  blockedReason: "",
  progress: null,
  updatedAt: 0,
  attachments: [],
};

const oneProjectBoard = {
  id: "bd",
  title: "",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

describe("ProjectsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSettingsForTests();
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

  it("renders the settings button top-right", async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
    });
  });

  it("auto-opens a new card when the autoOpenNewCards setting is on", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ autoOpenNewCards: true }),
    );
    __resetSettingsForTests();
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue(oneProjectBoard);
    vi.mocked(api.listCards).mockResolvedValue([]);
    vi.mocked(api.createCard).mockResolvedValue(newCard);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getAllByText("alpha").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /add a card/i }));

    await waitFor(() => {
      expect(screen.getByTestId("modal-overlay")).toBeInTheDocument();
    });
  });

  it("renders card preview in side-peek mode when setting is 'side-peek'", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ autoOpenNewCards: true, previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue(oneProjectBoard);
    vi.mocked(api.listCards).mockResolvedValue([]);
    vi.mocked(api.createCard).mockResolvedValue(newCard);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getAllByText("alpha").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /add a card/i }));

    await waitFor(() => {
      expect(
        screen.getByTestId("card-preview-root"),
      ).toHaveAttribute("data-preview-mode", "side-peek");
    });
  });

  it("renders card preview in modal mode by default", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ autoOpenNewCards: true }),
    );
    __resetSettingsForTests();
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue(oneProjectBoard);
    vi.mocked(api.listCards).mockResolvedValue([]);
    vi.mocked(api.createCard).mockResolvedValue(newCard);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getAllByText("alpha").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /add a card/i }));

    await waitFor(() => {
      expect(
        screen.getByTestId("card-preview-root"),
      ).toHaveAttribute("data-preview-mode", "modal");
    });
  });

  it("creating a new card while a preview is open replaces the open preview", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    const existing: Card = { ...newCard, id: "existing-id", title: "Existing Card" };
    const created: Card = { ...newCard, id: "created-id", title: "Freshly Made" };
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue({
      id: "bd",
      title: "",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: ["existing-id"] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    });
    vi.mocked(api.listCards).mockResolvedValue([existing]);
    vi.mocked(api.createCard).mockResolvedValue(created);

    const user = userEvent.setup();
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText("Existing Card")).toBeInTheDocument());

    await user.click(screen.getByText("Existing Card"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Existing Card")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /add a card/i }));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Freshly Made")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("Existing Card")).not.toBeInTheDocument();
  });

  it("clicking another card while a preview is open swaps the preview content", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    const cardA: Card = { ...newCard, id: "alpha-id", title: "Alpha Card" };
    const cardB: Card = { ...newCard, id: "beta-id", title: "Beta Card" };
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue({
      id: "bd",
      title: "",
      columns: [
        { id: "col-backlog", title: "Backlog", cardIds: ["alpha-id", "beta-id"] },
        { id: "col-progress", title: "In Progress", cardIds: [] },
        { id: "col-review", title: "Review", cardIds: [] },
        { id: "col-done", title: "Done", cardIds: [] },
      ],
    });
    vi.mocked(api.listCards).mockResolvedValue([cardA, cardB]);

    const user = userEvent.setup();
    render(<ProjectsPage />);
    await waitFor(() => expect(screen.getByText("Alpha Card")).toBeInTheDocument());

    await user.click(screen.getByText("Alpha Card"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Alpha Card")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Beta Card"));
    await waitFor(() =>
      expect(screen.getByDisplayValue("Beta Card")).toBeInTheDocument(),
    );
  });

  it("does not auto-open a new card when the autoOpenNewCards setting is off", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: "a", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 },
    ]);
    vi.mocked(api.getBoard).mockResolvedValue(oneProjectBoard);
    vi.mocked(api.listCards).mockResolvedValue([]);
    vi.mocked(api.createCard).mockResolvedValue(newCard);

    const user = userEvent.setup();
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getAllByText("alpha").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /add a card/i }));

    expect(screen.queryByTestId("modal-overlay")).not.toBeInTheDocument();
  });
});
