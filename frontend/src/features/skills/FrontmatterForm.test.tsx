import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrontmatterForm } from "./FrontmatterForm";

describe("FrontmatterForm", () => {
  it("edits name and description", () => {
    const onChange = vi.fn();
    render(
      <FrontmatterForm
        value={{ name: "a", description: "b" }}
        onChange={onChange}
        readOnly={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "foo" } });
    expect(onChange).toHaveBeenCalledWith({ name: "foo", description: "b" });
  });

  it("disables inputs when readOnly", () => {
    render(
      <FrontmatterForm
        value={{ name: "a", description: "b" }}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(screen.getByLabelText("name")).toBeDisabled();
    expect(screen.getByLabelText("description")).toBeDisabled();
  });
});
