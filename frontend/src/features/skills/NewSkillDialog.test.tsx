import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewSkillDialog } from "./NewSkillDialog";

describe("NewSkillDialog", () => {
  it("submits selected kind and name", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<NewSkillDialog open onClose={() => {}} onCreate={onCreate} defaultKind="skill" />);
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "my-skill" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith("skill", "my-skill");
  });
});
