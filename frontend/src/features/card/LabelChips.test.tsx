import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LabelChips } from "./LabelChips";

describe("LabelChips", () => {
  it("renders a chip per label", () => {
    render(<LabelChips labels={["bug", "urgent"]} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders nothing for empty list", () => {
    const { container } = render(<LabelChips labels={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
