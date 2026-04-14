import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentList } from "./AttachmentList";
import type { Attachment } from "../../shared/types/domain";

function sample(over: Partial<Attachment> = {}): Attachment {
  return { name: "spec.pdf", size: 2048, mimeType: "application/pdf", uploadedAt: 1, ...over };
}

describe("AttachmentList", () => {
  it("renders one tile per attachment", () => {
    render(
      <AttachmentList
        cardId="c1"
        attachments={[
          sample(),
          sample({ name: "wireframe.png", mimeType: "image/png" }),
          sample({ name: "clip.mp4", mimeType: "video/mp4" }),
        ]}
        onUpload={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    expect(screen.getByRole("button", { name: /open spec\.pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open wireframe\.png/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open clip\.mp4/i })).toBeInTheDocument();
  });

  it("opens lightbox when an image tile is clicked", async () => {
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample({ name: "wireframe.png", mimeType: "image/png" })]}
        onUpload={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open wireframe\.png/i }));
    const images = screen.getAllByAltText("wireframe.png");
    // tile still has the img plus the lightbox image
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes lightbox when close button clicked", async () => {
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample({ name: "wireframe.png", mimeType: "image/png" })]}
        onUpload={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open wireframe\.png/i }));
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("calls onDelete when tile delete button clicked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample()]}
        onUpload={() => Promise.resolve()}
        onDelete={onDelete}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /remove spec\.pdf/i }));
    expect(onDelete).toHaveBeenCalledWith("spec.pdf");
  });

  it("uploads file when chosen from file input", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentList
        cardId="c1"
        attachments={[]}
        onUpload={onUpload}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    const input = screen.getByTestId("attachment-file-input") as HTMLInputElement;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows a prominent dismissible error when upload fails", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("attachment: file too large"));
    render(
      <AttachmentList
        cardId="c1"
        attachments={[]}
        onUpload={onUpload}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    const input = screen.getByTestId("attachment-file-input") as HTMLInputElement;
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await userEvent.upload(input, file);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/file too large/i);

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismiss);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
