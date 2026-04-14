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
});
