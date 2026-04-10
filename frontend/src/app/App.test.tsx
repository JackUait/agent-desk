import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders without crashing", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: /agent desk/i })).toBeInTheDocument();
  });
});
