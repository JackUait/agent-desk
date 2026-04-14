import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsButton } from "./SettingsButton";
import { SETTINGS_STORAGE_KEY, __resetSettingsForTests } from "./use-settings";

beforeEach(() => {
  window.localStorage.clear();
  __resetSettingsForTests();
});

describe("SettingsButton", () => {
  it("renders a button labeled settings", () => {
    render(<SettingsButton />);
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("opens the settings dialog on click", async () => {
    const user = userEvent.setup();
    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      screen.getByRole("switch", { name: /open new cards immediately/i }),
    ).toBeInTheDocument();
  });

  it("toggling persists the setting across remounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("switch", { name: /open new cards immediately/i }));
    unmount();

    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      screen.getByRole("switch", { name: /open new cards immediately/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    ).toEqual({ autoOpenNewCards: true });
  });
});
