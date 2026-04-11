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

  it("renders empty columns with zero counts", () => {
    renderWithRouter(<BoardPage />);
    const zeroCounts = screen.getAllByText("0");
    expect(zeroCounts).toHaveLength(4);
  });
});
