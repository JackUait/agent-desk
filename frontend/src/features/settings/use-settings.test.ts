import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings, SETTINGS_STORAGE_KEY, __resetSettingsForTests } from "./use-settings";

beforeEach(() => {
  window.localStorage.clear();
  __resetSettingsForTests();
});

describe("useSettings", () => {
  it("defaults autoOpenNewCards to false", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.autoOpenNewCards).toBe(false);
  });

  it("reads the persisted value from localStorage", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ autoOpenNewCards: true }),
    );
    __resetSettingsForTests();
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.autoOpenNewCards).toBe(true);
  });

  it("setAutoOpenNewCards updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.setAutoOpenNewCards(true));
    expect(result.current.settings.autoOpenNewCards).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ autoOpenNewCards: true });
  });

  it("ignores malformed JSON and uses defaults", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{not-json");
    __resetSettingsForTests();
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.autoOpenNewCards).toBe(false);
  });

  it("defaults previewMode to 'modal'", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.previewMode).toBe("modal");
  });

  it("setPreviewMode updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.setPreviewMode("side-peek"));
    expect(result.current.settings.previewMode).toBe("side-peek");
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ previewMode: "side-peek" });
  });

  it("reads persisted previewMode from localStorage", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.previewMode).toBe("side-peek");
  });

  it("falls back to 'modal' if previewMode is an unknown value", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "floating" }),
    );
    __resetSettingsForTests();
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.previewMode).toBe("modal");
  });

  it("keeps multiple hook instances in sync", () => {
    const { result: a } = renderHook(() => useSettings());
    const { result: b } = renderHook(() => useSettings());
    expect(a.current.settings.autoOpenNewCards).toBe(false);
    expect(b.current.settings.autoOpenNewCards).toBe(false);
    act(() => a.current.setAutoOpenNewCards(true));
    expect(a.current.settings.autoOpenNewCards).toBe(true);
    expect(b.current.settings.autoOpenNewCards).toBe(true);
  });
});
