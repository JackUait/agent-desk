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
});
