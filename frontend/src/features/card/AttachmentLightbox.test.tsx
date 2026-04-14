import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { AttachmentLightbox } from "./AttachmentLightbox";
import type { Attachment } from "../../shared/types/domain";

function sample(overrides: Partial<Attachment> = {}): Attachment {
  return {
    name: "photo.png",
    size: 2048,
    mimeType: "image/png",
    uploadedAt: 1700000000000,
    ...overrides,
  };
}

describe("AttachmentLightbox", () => {
  it("renders an <img> with src=href for image attachments", () => {
    const att = sample();
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/photo.png"
        open
        onClose={() => {}}
      />,
    );
    const img = screen.getByAltText("photo.png") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("/files/photo.png");
  });

  it("renders an <iframe> with #view=FitH for pdf attachments", () => {
    const att = sample({ name: "doc.pdf", mimeType: "application/pdf" });
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/doc.pdf"
        open
        onClose={() => {}}
      />,
    );
    const iframe = screen.getByTitle("doc.pdf") as HTMLIFrameElement;
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.getAttribute("src")).toContain("#view=FitH");
  });

  it("header shows filename, formatted size, and mime text", () => {
    const att = sample({ name: "photo.png", size: 2048, mimeType: "image/png" });
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/photo.png"
        open
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
  });

  it("header download link has href and download attribute", () => {
    const att = sample();
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/photo.png"
        open
        onClose={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: /download/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/files/photo.png");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("close button fires onClose when clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const att = sample();
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/photo.png"
        open
        onClose={onClose}
      />,
    );
    const btn = screen.getByRole("button", { name: /close/i });
    await user.click(btn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when open=false", () => {
    const att = sample();
    render(
      <AttachmentLightbox
        attachment={att}
        href="/files/photo.png"
        open={false}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByAltText("photo.png")).toBeNull();
  });
});
