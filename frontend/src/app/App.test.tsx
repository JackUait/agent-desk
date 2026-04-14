import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn(),
    getBoard: vi.fn(),
    listCards: vi.fn(),
    createCard: vi.fn(),
  },
}));
vi.mock("../features/chat", () => ({
  useModels: () => ({ models: [] }),
}));

import { api } from "../shared/api/client";

const mockedApi = api as unknown as {
  listProjects: ReturnType<typeof vi.fn>;
  getBoard: ReturnType<typeof vi.fn>;
  listCards: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listProjects.mockResolvedValue([]);
});

describe("App", () => {
  it("renders without crashing", async () => {
    render(<App />);
    expect(
      await screen.findByText(/pick a folder/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});
