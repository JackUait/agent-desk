import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "./SettingsDialog";

describe("SettingsDialog", () => {
  it("does not render dialog content when closed", () => {
    render(
      <SettingsDialog
        open={false}
        onOpenChange={vi.fn()}
        autoOpenNewCards={false}
        onAutoOpenNewCardsChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/open new cards immediately/i)).not.toBeInTheDocument();
  });

  it("renders the auto-open toggle reflecting the current value", () => {
    render(
      <SettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        autoOpenNewCards={true}
        onAutoOpenNewCardsChange={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("switch", { name: /open new cards immediately/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("fires onAutoOpenNewCardsChange when toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        autoOpenNewCards={false}
        onAutoOpenNewCardsChange={onChange}
      />,
    );
    await user.click(screen.getByRole("switch", { name: /open new cards immediately/i }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
