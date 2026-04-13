import { describe, expect, it } from "vitest";
import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState,
} from "./chatStream";

const reduce = (state: ChatStreamState, frames: unknown[]): ChatStreamState =>
  frames.reduce<ChatStreamState>(
    (acc, frame) => chatStreamReducer(acc, frame),
    state,
  );

describe("chatStreamReducer", () => {
  it("initialChatStreamState is empty", () => {
    expect(initialChatStreamState).toEqual({ turns: [], turnInFlight: false });
  });

  it("turn_start sets turnInFlight true and turn_end clears it", () => {
    const afterStart = chatStreamReducer(initialChatStreamState, {
      type: "turn_start",
      sessionId: "s1",
    });
    expect(afterStart.turnInFlight).toBe(true);
    const afterEnd = chatStreamReducer(afterStart, {
      type: "turn_end",
      durationMs: 1,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      stopReason: "end_turn",
    });
    expect(afterEnd.turnInFlight).toBe(false);
  });

  it("turn_start creates a new streaming turn with sessionId", () => {
    const state = chatStreamReducer(initialChatStreamState, {
      type: "turn_start",
      sessionId: "sess-1",
    });
    expect(state.turns).toEqual([
      { sessionId: "sess-1", blocks: [], status: "streaming" },
    ]);
  });

  it("text block accumulates deltas and marks done on stop", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "text" },
      { type: "block_delta", index: 0, text: "Hello " },
      { type: "block_delta", index: 0, text: "world" },
      { type: "block_stop", index: 0 },
    ]);
    expect(state.turns[0].blocks).toEqual([
      { kind: "text", index: 0, text: "Hello world", done: true },
    ]);
  });

  it("thinking block accumulates thinking text and marks done on stop", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "thinking" },
      { type: "block_delta", index: 0, thinking: "hmm " },
      { type: "block_delta", index: 0, thinking: "ok" },
      { type: "block_stop", index: 0 },
    ]);
    expect(state.turns[0].blocks).toEqual([
      { kind: "thinking", index: 0, thinking: "hmm ok", done: true },
    ]);
  });

  it("tool_use block accumulates partialJson and marks done on stop", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      {
        type: "block_start",
        index: 0,
        kind: "tool_use",
        toolId: "t1",
        toolName: "Bash",
      },
      { type: "block_delta", index: 0, partialJson: "{\"a\":" },
      { type: "block_delta", index: 0, partialJson: "1}" },
      { type: "block_stop", index: 0 },
    ]);
    expect(state.turns[0].blocks).toEqual([
      {
        kind: "tool_use",
        index: 0,
        toolId: "t1",
        toolName: "Bash",
        partialJson: "{\"a\":1}",
        done: true,
      },
    ]);
  });

  it("tool_result frame attaches result to the matching tool_use block by toolId", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      {
        type: "block_start",
        index: 0,
        kind: "tool_use",
        toolId: "t1",
        toolName: "Bash",
      },
      { type: "block_stop", index: 0 },
      {
        type: "tool_result",
        toolUseId: "t1",
        content: "ok",
        isError: false,
      },
    ]);
    const block = state.turns[0].blocks[0];
    expect(block.kind).toBe("tool_use");
    if (block.kind === "tool_use") {
      expect(block.result).toEqual({ content: "ok", isError: false });
    }
  });

  it("turn_end sets metrics and flips status to done", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      {
        type: "turn_end",
        durationMs: 100,
        costUsd: 0.01,
        inputTokens: 3,
        outputTokens: 5,
        stopReason: "end_turn",
      },
    ]);
    expect(state.turns[0]).toEqual({
      sessionId: "s",
      blocks: [],
      status: "done",
      metrics: {
        durationMs: 100,
        costUsd: 0.01,
        inputTokens: 3,
        outputTokens: 5,
        stopReason: "end_turn",
      },
    });
  });

  it("block_start with the same index replaces the previous block in place", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "text" },
      { type: "block_delta", index: 0, text: "old" },
      { type: "block_start", index: 0, kind: "thinking" },
    ]);
    expect(state.turns[0].blocks).toEqual([
      { kind: "thinking", index: 0, thinking: "", done: false },
    ]);
  });

  it("a second turn_start starts a fresh turn without affecting the first", () => {
    const state = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s1" },
      { type: "block_start", index: 0, kind: "text" },
      { type: "block_delta", index: 0, text: "hi" },
      { type: "block_stop", index: 0 },
      { type: "turn_start", sessionId: "s2" },
    ]);
    expect(state.turns).toHaveLength(2);
    expect(state.turns[0].blocks).toEqual([
      { kind: "text", index: 0, text: "hi", done: true },
    ]);
    expect(state.turns[1]).toEqual({
      sessionId: "s2",
      blocks: [],
      status: "streaming",
    });
  });

  it("block_delta for an unknown index is dropped, state unchanged", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "text" },
    ]);
    const after = chatStreamReducer(before, {
      type: "block_delta",
      index: 99,
      text: "x",
    });
    expect(after).toBe(before);
  });

  it("tool_result for an unknown toolUseId is dropped, state unchanged", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      {
        type: "block_start",
        index: 0,
        kind: "tool_use",
        toolId: "t1",
        toolName: "Bash",
      },
    ]);
    const after = chatStreamReducer(before, {
      type: "tool_result",
      toolUseId: "nope",
      content: "x",
      isError: false,
    });
    expect(after).toBe(before);
  });

  it("legacy token frame is ignored, state unchanged", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
    ]);
    const after = chatStreamReducer(before, { type: "token", content: "hi" });
    expect(after).toBe(before);
  });

  it("legacy message frame is ignored, state unchanged", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
    ]);
    const after = chatStreamReducer(before, {
      type: "message",
      role: "assistant",
      content: "hi",
      id: "1",
      timestamp: 0,
    });
    expect(after).toBe(before);
  });

  it("error frame is ignored (state unchanged)", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
    ]);
    const after = chatStreamReducer(before, {
      type: "error",
      message: "boom",
    });
    expect(after).toBe(before);
  });

  it("null/undefined/non-object input returns state unchanged without throwing", () => {
    expect(chatStreamReducer(initialChatStreamState, null)).toBe(
      initialChatStreamState,
    );
    expect(chatStreamReducer(initialChatStreamState, undefined)).toBe(
      initialChatStreamState,
    );
    expect(chatStreamReducer(initialChatStreamState, 42)).toBe(
      initialChatStreamState,
    );
    expect(chatStreamReducer(initialChatStreamState, "string")).toBe(
      initialChatStreamState,
    );
    expect(chatStreamReducer(initialChatStreamState, {})).toBe(
      initialChatStreamState,
    );
    expect(
      chatStreamReducer(initialChatStreamState, { type: "unknown_xyz" }),
    ).toBe(initialChatStreamState);
  });

  it("block_delta with mismatched field is dropped, state unchanged", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "thinking" },
    ]);
    const after = chatStreamReducer(before, {
      type: "block_delta",
      index: 0,
      text: "wrong field",
    });
    expect(after).toBe(before);
  });

  it("applying a block_delta returns a new state object without mutating the original", () => {
    const before = reduce(initialChatStreamState, [
      { type: "turn_start", sessionId: "s" },
      { type: "block_start", index: 0, kind: "text" },
    ]);
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = chatStreamReducer(before, {
      type: "block_delta",
      index: 0,
      text: "hi",
    });
    expect(after).not.toBe(before);
    expect(after.turns).not.toBe(before.turns);
    expect(before).toEqual(snapshot);
  });

  it("real-world sequence test", () => {
    const frames: unknown[] = [
      { type: "turn_start", sessionId: "sess" },
      { type: "block_start", index: 0, kind: "thinking" },
      { type: "block_delta", index: 0, thinking: "Let me " },
      { type: "block_delta", index: 0, thinking: "think..." },
      { type: "block_stop", index: 0 },
      {
        type: "block_start",
        index: 1,
        kind: "tool_use",
        toolId: "t1",
        toolName: "Bash",
      },
      { type: "block_delta", index: 1, partialJson: "{\"cmd" },
      { type: "block_delta", index: 1, partialJson: "\": \"ls\"}" },
      { type: "block_stop", index: 1 },
      {
        type: "tool_result",
        toolUseId: "t1",
        content: "file1\nfile2",
        isError: false,
      },
      { type: "block_start", index: 2, kind: "text" },
      { type: "block_delta", index: 2, text: "Done" },
      { type: "block_stop", index: 2 },
      {
        type: "turn_end",
        durationMs: 1234,
        costUsd: 0.01,
        inputTokens: 5,
        outputTokens: 7,
        stopReason: "end_turn",
      },
    ];
    const state = reduce(initialChatStreamState, frames);
    expect(state).toEqual({
      turns: [
        {
          sessionId: "sess",
          status: "done",
          metrics: {
            durationMs: 1234,
            costUsd: 0.01,
            inputTokens: 5,
            outputTokens: 7,
            stopReason: "end_turn",
          },
          blocks: [
            {
              kind: "thinking",
              index: 0,
              thinking: "Let me think...",
              done: true,
            },
            {
              kind: "tool_use",
              index: 1,
              toolId: "t1",
              toolName: "Bash",
              partialJson: "{\"cmd\": \"ls\"}",
              done: true,
              result: { content: "file1\nfile2", isError: false },
            },
            { kind: "text", index: 2, text: "Done", done: true },
          ],
        },
      ],
      turnInFlight: false,
    });
  });
});
