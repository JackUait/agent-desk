import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelChooser } from "./ModelChooser";
import type { Model } from "../../shared/types/domain";

const MODELS: Model[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

describe("ModelChooser", () => {
  it("shows the model label and effort in the trigger", () => {
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-sonnet-4-6", effort: "high" }}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId("model-chooser");
    expect(trigger).toHaveTextContent("Sonnet 4.6");
    expect(trigger).toHaveTextContent("high");
  });

  it("fires onChange with {model, effort} when a leaf is clicked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-opus-4-6", effort: "medium" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("model-chooser"));
    await user.hover(await screen.findByRole("menuitem", { name: /Sonnet 4\.6/i }));
    // Submenu opens; pick "max"
    const maxItem = await screen.findByRole("menuitemcheckbox", { name: /max/i });
    fireEvent.click(maxItem);

    expect(onChange).toHaveBeenCalledWith({
      model: "claude-sonnet-4-6",
      effort: "max",
    });
  });

  it("disables the trigger when disabled prop is set", () => {
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-opus-4-6", effort: "medium" }}
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByTestId("model-chooser")).toBeDisabled();
  });

  it("renders a check indicator only on the currently selected leaf", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ModelChooser
        models={MODELS}
        value={{ model: "claude-haiku-4-5", effort: "low" }}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId("model-chooser"));
    await user.hover(await screen.findByRole("menuitem", { name: /Haiku 4\.5/i }));

    const lowItem = await screen.findByRole("menuitemcheckbox", { name: /low/i });
    const maxItem = await screen.findByRole("menuitemcheckbox", { name: /max/i });
    expect(lowItem).toHaveAttribute("aria-checked", "true");
    expect(maxItem).toHaveAttribute("aria-checked", "false");
  });
});
