import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { BoardPage } from "./BoardPage";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getBoard.mockResolvedValue({
    id: "board-1",
    title: "Agent Desk",
    columns: [
      { id: "col-backlog", title: "Backlog", cardIds: [] },
      { id: "col-progress", title: "In Progress", cardIds: [] },
      { id: "col-review", title: "Review", cardIds: [] },
      { id: "col-done", title: "Done", cardIds: [] },
    ],
  });
  mockedApi.listCards.mockResolvedValue([]);
});

describe("BoardPage", () => {
  it("renders the heading", async () => {
    renderWithRouter(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
    });
  });

  it("renders the board container", async () => {
    renderWithRouter(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("board-container")).toBeInTheDocument();
    });
  });

  it("renders all four columns", async () => {
    renderWithRouter(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByText("Backlog")).toBeInTheDocument();
    });
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders the new card button", async () => {
    renderWithRouter(<BoardPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new card/i })).toBeInTheDocument();
    });
  });
});
