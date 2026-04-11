import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCardSocket } from "./useCardSocket";

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
    // Trigger onopen asynchronously so callers can set the handler first
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
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("accumulates token messages as streaming content", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "token", content: "Hello" });
      getInstance().simulateMessage({ type: "token", content: " world" });
    });
    expect(result.current.streamingContent).toBe("Hello world");
  });

  it("adds a message and clears streaming on message event", () => {
    const { result } = renderHook(() => useCardSocket("card-1"));
    act(() => {
      getInstance().simulateOpen();
      getInstance().simulateMessage({ type: "token", content: "partial" });
      getInstance().simulateMessage({
        type: "message",
        role: "assistant",
        content: "Full response",
        id: "msg-1",
        timestamp: 1000,
      });
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("Full response");
    expect(result.current.streamingContent).toBe("");
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
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello agent");
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
