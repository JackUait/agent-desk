import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../shared/test-utils/render";
import { CardDetail } from "./CardDetail";
import { Route, Routes } from "react-router";

function renderCardDetail(id: string) {
  renderWithRouter(
    <Routes>
      <Route path="/card/:id" element={<CardDetail />} />
    </Routes>,
    { initialEntries: [`/card/${id}`] }
  );
}

describe("CardDetail", () => {
  it("displays the card id from route params", () => {
    renderCardDetail("card-42");
    expect(screen.getByText(/card-42/)).toBeInTheDocument();
  });

  it("renders the card detail container", () => {
    renderCardDetail("card-1");
    expect(screen.getByTestId("card-detail")).toBeInTheDocument();
  });
});
