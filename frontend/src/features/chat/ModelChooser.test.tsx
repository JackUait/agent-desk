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
  it("renders one option per model", () => {
    render(
      <ModelChooser models={MODELS} value="claude-opus-4-6" onChange={() => {}} />,
    );
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    expect(select.options[0].value).toBe("claude-opus-4-6");
    expect(select.options[0].textContent).toBe("Opus 4.6");
    expect(select.options[1].value).toBe("claude-sonnet-4-6");
    expect(select.options[2].value).toBe("claude-haiku-4-5");
  });

  it("reflects the value prop as the selected option", () => {
    render(
      <ModelChooser models={MODELS} value="claude-sonnet-4-6" onChange={() => {}} />,
    );
    const select = screen.getByTestId("model-chooser") as HTMLSelectElement;
    expect(select.value).toBe("claude-sonnet-4-6");
  });

  it("calls onChange with the newly selected id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ModelChooser models={MODELS} value="claude-opus-4-6" onChange={onChange} />,
    );
    const select = screen.getByTestId("model-chooser");
    await user.selectOptions(select, "claude-haiku-4-5");
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
