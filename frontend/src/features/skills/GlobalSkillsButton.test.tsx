import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobalSkillsButton } from "./GlobalSkillsButton";

vi.mock("./SkillsDialog", () => ({
  SkillsDialog: ({ open, scope }: { open: boolean; scope: { kind: string } }) =>
    open ? <div data-testid="dialog">{scope.kind}</div> : null,
}));

describe("GlobalSkillsButton", () => {
  it("opens dialog with global scope", () => {
    render(<GlobalSkillsButton />);
    fireEvent.click(screen.getByRole("button", { name: /skills/i }));
    expect(screen.getByTestId("dialog").textContent).toBe("global");
  });
});
