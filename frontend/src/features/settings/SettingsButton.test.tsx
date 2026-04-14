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

  it("opens the settings menu on click", async () => {
    const user = userEvent.setup();
    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      screen.getByRole("switch", { name: /open new cards immediately/i }),
    ).toBeInTheDocument();
  });

  it("renders the setting inside a popover anchored to the trigger", async () => {
    const user = userEvent.setup();
    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    const toggle = screen.getByRole("switch", { name: /open new cards immediately/i });
    const positioner = toggle.closest("[data-side]");
    expect(positioner).not.toBeNull();
  });

  it("renders a search input in the popover header", async () => {
    const user = userEvent.setup();
    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      screen.getByPlaceholderText(/search actions/i),
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
    ).toMatchObject({ autoOpenNewCards: true });
  });

  it("renders a preview mode picker defaulting to modal", async () => {
    const user = userEvent.setup();
    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    const group = screen.getByRole("radiogroup", { name: /preview mode/i });
    expect(group).toBeInTheDocument();
    const modal = screen.getByRole("radio", { name: /^modal$/i });
    const sidePeek = screen.getByRole("radio", { name: /side peek/i });
    expect(modal).toHaveAttribute("aria-checked", "true");
    expect(sidePeek).toHaveAttribute("aria-checked", "false");
  });

  it("selecting side peek persists preview mode", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("radio", { name: /side peek/i }));
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ previewMode: "side-peek" });
    unmount();

    render(<SettingsButton />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(
      screen.getByRole("radio", { name: /side peek/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
