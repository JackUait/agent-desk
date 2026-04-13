import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCardSocket } from "./useCardSocket";
import { api } from "./client";
import type { Message } from "../types/domain";

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.onclose) this.onclose();
  }

  simulateOpen() {
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateError() {
    if (this.onerror) this.onerror(new Event("error"));
  }

  static instances: MockWebSocket[] = [];

  static reset() {
    MockWebSocket.instances = [];
  }
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.spyOn(api, "listMessages").mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function getInstance() {
  return MockWebSocket.instances[0];
}

describe("useCardSocket", () => {
  it("connects to the correct WebSocket URL", () => {
    renderHook(() => useCardSocket("card-abc"));
    expect(getInstance().url).toMatch(/\/api\/cards\/card-abc\/ws$/);
  });

  it("reports connected status after open", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    expect(result.current.status).toBe("connected");
  });

  it("starts in connecting status", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    expect(result.current.status).toBe("connecting");
  });

  it("folds typed stream frames into chatStream state", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "turn_start", sessionId: "s1" });
      getInstance().simulateMessage({
        type: "block_start",
        index: 0,
        kind: "text",
      });
      getInstance().simulateMessage({
        type: "block_delta",
        index: 0,
        text: "hello",
      });
      getInstance().simulateMessage({
        type: "block_delta",
        index: 0,
        text: " world",
      });
      getInstance().simulateMessage({ type: "block_stop", index: 0 });
      getInstance().simulateMessage({
        type: "turn_end",
        durationMs: 500,
        costUsd: 0.002,
        inputTokens: 1,
        outputTokens: 2,
        stopReason: "end_turn",
      });
    });

    const turns = result.current.chatStream.turns;
    expect(turns).toHaveLength(1);
    expect(turns[0].status).toBe("done");
    const block = turns[0].blocks[0];
    expect(block.kind).toBe("text");
    if (block.kind === "text") {
      expect(block.text).toBe("hello world");
      expect(block.done).toBe(true);
    }
  });

  it("sendMessage sends JSON and adds user message locally", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    act(() => {
      result.current.sendMessage("Hello agent");
    });
    const sent = JSON.parse(getInstance().sent[0]);
    expect(sent).toEqual({ type: "message", content: "Hello agent" });
    expect(result.current.userMessages).toHaveLength(1);
    expect(result.current.userMessages[0].role).toBe("user");
    expect(result.current.userMessages[0].content).toBe("Hello agent");
  });

  it("sendMessage includes the model when provided", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    act(() => {
      result.current.sendMessage("Hello", "claude-sonnet-4-6");
    });
    const sent = JSON.parse(getInstance().sent[0]);
    expect(sent).toEqual({
      type: "message",
      content: "Hello",
      model: "claude-sonnet-4-6",
    });
  });

  it("sendMessage omits model when not provided", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    act(() => {
      result.current.sendMessage("Hello");
    });
    const sent = JSON.parse(getInstance().sent[0]);
    expect(sent).not.toHaveProperty("model");
  });

  it("sendAction sends action type as JSON", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    act(() => {
      result.current.sendAction("start");
    });
    const sent = JSON.parse(getInstance().sent[0]);
    expect(sent).toEqual({ type: "start" });
  });

  it("updates currentColumn on status message", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "status", column: "in_progress" });
    });
    expect(result.current.currentColumn).toBe("in_progress");
  });

  it("sets prUrl on pr message", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "pr", url: "https://github.com/pr/1" });
    });
    expect(result.current.prUrl).toBe("https://github.com/pr/1");
  });

  it("sets worktreePath on worktree message", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "worktree", path: "/tmp/worktrees/card-1" });
    });
    expect(result.current.worktreePath).toBe("/tmp/worktrees/card-1");
  });

  it("sets error on error message", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "error", message: "something went wrong" });
    });
    expect(result.current.error).toBe("something went wrong");
  });

  it("calls api.listMessages with the cardId on mount", () => {
    const spy = vi
      .spyOn(api, "listMessages")
      .mockResolvedValue([]);
    renderHook(() => useCardSocket("card-1"));
    expect(spy).toHaveBeenCalledWith("card-1");
  });

  it("populates userMessages from persisted user messages on mount", async () => {
    const persisted: Message[] = [
      { id: "m1", role: "user", content: "hi", timestamp: 1 },
      { id: "m2", role: "assistant", content: "hello", timestamp: 2 },
    ];
    vi.spyOn(api, "listMessages").mockResolvedValue(persisted);
    const { result } = renderHook(() => useCardSocket("card-1"));
    await waitFor(() => {
      expect(result.current.userMessages).toHaveLength(1);
    });
    expect(result.current.userMessages[0].role).toBe("user");
    expect(result.current.userMessages[0].content).toBe("hi");
  });

  it("hydrates chatStream from persisted assistant messages on mount", async () => {
    const persisted: Message[] = [
      { id: "m1", role: "user", content: "hi", timestamp: 1 },
      { id: "m2", role: "assistant", content: "hello", timestamp: 2 },
    ];
    vi.spyOn(api, "listMessages").mockResolvedValue(persisted);
    const { result } = renderHook(() => useCardSocket("card-1"));
    await waitFor(() => {
      expect(result.current.chatStream.turns).toHaveLength(1);
    });
    const turn = result.current.chatStream.turns[0];
    expect(turn.status).toBe("done");
    const block = turn.blocks[0];
    expect(block.kind).toBe("text");
    if (block.kind === "text") {
      expect(block.text).toBe("hello");
      expect(block.done).toBe(true);
    }
  });

  it("swallows listMessages errors and keeps empty state", async () => {
    vi.spyOn(api, "listMessages").mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCardSocket("card-1"));
    await waitFor(() => {
      expect(result.current.userMessages).toEqual([]);
    });
    expect(result.current.chatStream.turns).toEqual([]);
    expect(result.current.status).toBe("connecting");
    expect(result.current.error).toBeNull();
  });

  it("reports disconnected on close", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
    });
    act(() => {
      getInstance().close();
    });
    expect(result.current.status).toBe("disconnected");
  });
});
