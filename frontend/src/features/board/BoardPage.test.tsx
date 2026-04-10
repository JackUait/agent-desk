import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { BoardPage } from "./BoardPage";

describe("BoardPage", () => {
  it("renders the heading", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });

  it("renders the board container", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByTestId("board-container")).toBeInTheDocument();
  });

  it("renders all four columns", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders cards within columns", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByText("Set up CI pipeline")).toBeInTheDocument();
    expect(screen.getByText("Design auth flow")).toBeInTheDocument();
    expect(screen.getByText("Fix memory leak in worker")).toBeInTheDocument();
  });

  it("shows agent names on cards", () => {
    renderWithRouter(<BoardPage />);
    expect(screen.getByText("DevOps-1")).toBeInTheDocument();
    expect(screen.getByText("Architect-1")).toBeInTheDocument();
  });
});
