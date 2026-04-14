import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentTile } from "./AttachmentTile";
import type { Attachment } from "../../shared/types/domain";

function sample(over: Partial<Attachment> = {}): Attachment {
  return { name: "spec.pdf", size: 2048, mimeType: "application/pdf", uploadedAt: 1, ...over };
}

describe("AttachmentTile", () => {
  it("renders an <img> for image attachments with src equal to href", () => {
    const att = sample({ name: "wireframe.png", mimeType: "image/png" });
    render(
      <AttachmentTile
        attachment={att}
        href="/files/wireframe.png"
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );
    const img = screen.getByRole("img", { name: /wireframe\.png/i }) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/files/wireframe.png");
  });

  it("renders a glyph (no img) for pdf attachments", () => {
    render(
      <AttachmentTile
        attachment={sample()}
        href="/files/spec.pdf"
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/spec\.pdf/i)).toBeInTheDocument();
  });

  it("fires onOpen with attachment name when tile body is clicked", async () => {
    const onOpen = vi.fn();
    render(
      <AttachmentTile
        attachment={sample()}
        href="/files/spec.pdf"
        onOpen={onOpen}
        onDelete={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open spec\.pdf/i }));
    expect(onOpen).toHaveBeenCalledWith("spec.pdf");
  });

  it("has a delete button labeled 'remove spec.pdf' that calls onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <AttachmentTile
        attachment={sample()}
        href="/files/spec.pdf"
        onOpen={() => {}}
        onDelete={onDelete}
      />,
    );
    const del = screen.getByRole("button", { name: /remove spec\.pdf/i });
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith("spec.pdf");
  });

  it("does not fire onOpen when only the delete button is clicked", async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <AttachmentTile
        attachment={sample()}
        href="/files/spec.pdf"
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove spec\.pdf/i }));
    expect(onDelete).toHaveBeenCalledWith("spec.pdf");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
