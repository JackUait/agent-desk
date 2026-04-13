import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelChooser } from "./ModelChooser";
import type { Model } from "../../shared/types/domain";

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

describe("ModelChooser", () => {
  it("renders one option per model", async () => {
    const user = userEvent.setup();
    render(
      <ModelChooser models={MODELS} value="claude-opus-4-6" onChange={() => {}} />,
    );
    await user.click(screen.getByTestId("model-chooser"));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Opus 4.6");
    expect(options[1]).toHaveTextContent("Sonnet 4.6");
    expect(options[2]).toHaveTextContent("Haiku 4.5");
  });

  it("reflects the value prop as the selected option", () => {
    render(
      <ModelChooser models={MODELS} value="claude-sonnet-4-6" onChange={() => {}} />,
    );
    // The trigger button displays the label of the currently selected model.
    expect(screen.getByTestId("model-chooser")).toHaveTextContent("Sonnet 4.6");
  });

  it("calls onChange with the newly selected id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ModelChooser models={MODELS} value="claude-opus-4-6" onChange={onChange} />,
    );
    await user.click(screen.getByTestId("model-chooser"));
    const options = await screen.findAllByRole("option");
    const haiku = options.find((o) => o.textContent?.includes("Haiku 4.5"));
    if (!haiku) throw new Error("Haiku 4.5 option not found");
    await user.click(haiku);
    expect(onChange).toHaveBeenCalledWith("claude-haiku-4-5");
  });

  it("disables the select when disabled prop is true", () => {
    render(
      <ModelChooser
        models={MODELS}
        value="claude-opus-4-6"
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });
});
