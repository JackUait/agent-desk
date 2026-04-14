import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttachmentList } from "./AttachmentList";
import type { Attachment } from "../../shared/types/domain";

function sample(over: Partial<Attachment> = {}): Attachment {
  return { name: "spec.pdf", size: 2048, mimeType: "application/pdf", uploadedAt: 1, ...over };
}

describe("AttachmentList", () => {
  it("renders each attachment with a download link", () => {
    render(
      <AttachmentList
        cardId="c1"
        attachments={[sample(), sample({ name: "wireframe.png", mimeType: "image/png" })]}
        onUpload={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        hrefFor={(_, n) => `/files/${n}`}
      />,
    );
    const link = screen.getByRole("link", { name: /spec\.pdf/i });
    expect(link).toHaveAttribute("href", "/files/spec.pdf");
  });

  it("calls onDelete when × clicked", async () => {
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
});
