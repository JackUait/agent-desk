import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders step/totalSteps and currentStep text", () => {
    render(<ProgressBar step={2} totalSteps={5} currentStep="writing tests" />);
    expect(screen.getByText("writing tests")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("exposes progressbar role with aria-valuenow", () => {
    render(<ProgressBar step={3} totalSteps={4} currentStep="x" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
  });

  it("clamps percentage at 100 even if step === totalSteps", () => {
    render(<ProgressBar step={5} totalSteps={5} currentStep="done" />);
    const fill = screen.getByTestId("progress-fill");
    expect(fill).toHaveStyle({ width: "100%" });
  });

  it("progressbar has accessible name from currentStep", () => {
    render(<ProgressBar step={1} totalSteps={3} currentStep="writing tests" />);
    expect(screen.getByRole("progressbar", { name: "writing tests" })).toBeInTheDocument();
  });
});
