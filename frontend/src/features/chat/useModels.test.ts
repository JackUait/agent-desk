import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useModels, EFFORTS, type Effort } from "./useModels";

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useModels", () => {
  it("fetches /api/models and returns the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MODELS),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useModels());
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/models");
    expect(result.current.models).toEqual(MODELS);
  });

  it("returns empty list and loading=false on fetch rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useModels());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models).toEqual([]);
    consoleError.mockRestore();
  });

  it("returns empty list when response is not ok", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useModels());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models).toEqual([]);
    consoleError.mockRestore();
  });
});

describe("EFFORTS", () => {
  it("exposes the four CLI effort levels in UX order", () => {
    expect(EFFORTS).toEqual(["low", "medium", "high", "max"]);
  });

  it("Effort type matches the EFFORTS tuple", () => {
    // Compile-time check: assigning each literal must satisfy Effort.
    const a: Effort = "low";
    const b: Effort = "medium";
    const c: Effort = "high";
    const d: Effort = "max";
    expect([a, b, c, d]).toEqual(EFFORTS);
  });
});
