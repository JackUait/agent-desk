import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

const project = { id: "p1", title: "alpha", path: "/tmp/a", colorIdx: 0, createdAt: 1 };

describe("DeleteProjectDialog", () => {
  it("disables the delete button until the exact title is typed", () => {
    render(
      <DeleteProjectDialog project={project} open={true} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /delete/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "alph" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(button.disabled).toBe(false);
  });

  it("fires onConfirm when delete is clicked with matching input", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteProjectDialog project={project} open={true} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledWith("p1");
  });
});
