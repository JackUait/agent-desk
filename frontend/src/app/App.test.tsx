import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

vi.mock("../shared/api/client", () => ({
  api: {
    getBoard: vi.fn(),
    listCards: vi.fn(),
    createCard: vi.fn(),
  },
}));

import { api } from "../shared/api/client";

const mockedApi = api as unknown as {
  getBoard: ReturnType<typeof vi.fn>;
  listCards: ReturnType<typeof vi.fn>;
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

describe("App", () => {
  it("renders without crashing", async () => {
    render(<App />);
    expect(
      await screen.findByRole(
        "heading",
        { name: /agent desk/i },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
