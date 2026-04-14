import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlockedBanner } from "./BlockedBanner";

describe("BlockedBanner", () => {
  it("renders the reason as a status region with accessible name", () => {
    render(<BlockedBanner reason="waiting on DB schema" />);
    expect(screen.getByText(/waiting on DB schema/i)).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: /blocked.*waiting on DB schema/i }),
    ).toBeInTheDocument();
  });
});
