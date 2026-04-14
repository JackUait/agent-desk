import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  requestSidePeek,
  releaseSidePeek,
  __resetSidePeekForTests,
} from "./side-peek-coordinator";

beforeEach(() => __resetSidePeekForTests());

describe("side-peek coordinator", () => {
  it("first request always succeeds", () => {
    expect(requestSidePeek("a", () => true)).toBe(true);
  });

  it("re-requesting same id keeps ownership without calling release", () => {
    const release = vi.fn(() => true);
    requestSidePeek("a", release);
    expect(requestSidePeek("a", release)).toBe(true);
    expect(release).not.toHaveBeenCalled();
  });

  it("new owner takes over when previous releases", () => {
    const releaseA = vi.fn(() => true);
    requestSidePeek("a", releaseA);
    expect(requestSidePeek("b", () => true)).toBe(true);
    expect(releaseA).toHaveBeenCalledTimes(1);
  });

  it("new owner is denied when previous refuses to release", () => {
    const releaseA = vi.fn(() => false);
    requestSidePeek("a", releaseA);
    expect(requestSidePeek("b", () => true)).toBe(false);
    expect(releaseA).toHaveBeenCalledTimes(1);
  });

  it("releaseSidePeek clears ownership for matching id", () => {
    requestSidePeek("a", () => true);
    releaseSidePeek("a");
    expect(requestSidePeek("b", () => false)).toBe(true);
  });

  it("releaseSidePeek ignores non-matching id", () => {
    const releaseA = vi.fn(() => false);
    requestSidePeek("a", releaseA);
    releaseSidePeek("b");
    expect(requestSidePeek("c", () => true)).toBe(false);
    expect(releaseA).toHaveBeenCalledTimes(1);
  });
});
