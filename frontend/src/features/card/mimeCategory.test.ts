import { describe, it, expect } from "vitest";
import { mimeCategory } from "./mimeCategory";

describe("mimeCategory", () => {
  it("classifies png as image", () => {
    expect(mimeCategory("image/png")).toBe("image");
  });

  it("classifies webp as image", () => {
    expect(mimeCategory("image/webp")).toBe("image");
  });

  it("classifies mp4 as video", () => {
    expect(mimeCategory("video/mp4")).toBe("video");
  });

  it("classifies mpeg audio as audio", () => {
    expect(mimeCategory("audio/mpeg")).toBe("audio");
  });

  it("classifies pdf as pdf", () => {
    expect(mimeCategory("application/pdf")).toBe("pdf");
  });

  it("classifies text/plain as text", () => {
    expect(mimeCategory("text/plain")).toBe("text");
  });

  it("classifies text/javascript as text", () => {
    expect(mimeCategory("text/javascript")).toBe("text");
  });

  it("classifies application/json as text", () => {
    expect(mimeCategory("application/json")).toBe("text");
  });

  it("falls back to filename extension for octet-stream", () => {
    expect(mimeCategory("application/octet-stream", "foo.md")).toBe("text");
  });

  it("returns other for octet-stream with unknown extension", () => {
    expect(mimeCategory("application/octet-stream", "foo.bin")).toBe("other");
  });

  it("classifies zip as other", () => {
    expect(mimeCategory("application/zip")).toBe("other");
  });

  it("falls back to extension for video octet-stream", () => {
    expect(mimeCategory("application/octet-stream", "clip.mov")).toBe("video");
    expect(mimeCategory("application/octet-stream", "clip.mp4")).toBe("video");
    expect(mimeCategory("application/octet-stream", "clip.webm")).toBe("video");
  });

  it("falls back to extension for image octet-stream", () => {
    expect(mimeCategory("application/octet-stream", "pic.png")).toBe("image");
    expect(mimeCategory("application/octet-stream", "pic.jpg")).toBe("image");
  });

  it("falls back to extension for audio octet-stream", () => {
    expect(mimeCategory("application/octet-stream", "track.mp3")).toBe("audio");
    expect(mimeCategory("application/octet-stream", "track.wav")).toBe("audio");
  });

  it("falls back to extension for pdf octet-stream", () => {
    expect(mimeCategory("application/octet-stream", "doc.pdf")).toBe("pdf");
  });
});
