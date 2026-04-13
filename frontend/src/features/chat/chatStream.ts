export type ChatStreamFrame =
  | { type: "turn_start"; sessionId: string }
  | { type: "block_start"; index: number; kind: "text" }
  | { type: "block_start"; index: number; kind: "thinking" }
  | {
      type: "block_start";
      index: number;
      kind: "tool_use";
      toolId: string;
      toolName: string;
    }
  | { type: "block_delta"; index: number; text: string }
  | { type: "block_delta"; index: number; thinking: string }
  | { type: "block_delta"; index: number; partialJson: string }
  | { type: "block_stop"; index: number }
  | {
      type: "tool_result";
      toolUseId: string;
      content: string;
      isError: boolean;
    }
  | {
      type: "turn_end";
      durationMs: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      stopReason: string;
    };

export type ChatBlock =
  | { kind: "text"; index: number; text: string; done: boolean }
  | { kind: "thinking"; index: number; thinking: string; done: boolean }
  | {
      kind: "tool_use";
      index: number;
      toolId: string;
      toolName: string;
      partialJson: string;
      result?: { content: string; isError: boolean };
      done: boolean;
    };

export type ChatTurn = {
  sessionId?: string;
  blocks: ChatBlock[];
  metrics?: {
    durationMs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    stopReason: string;
  };
  status: "streaming" | "done";
};

export type ChatStreamState = {
  turns: ChatTurn[];
  turnInFlight: boolean;
};

export const initialChatStreamState: ChatStreamState = {
  turns: [],
  turnInFlight: false,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isChatStreamFrame = (value: unknown): value is ChatStreamFrame => {
  if (!isObject(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "turn_start":
    case "block_start":
    case "block_delta":
    case "block_stop":
    case "tool_result":
    case "turn_end":
      return true;
    default:
      return false;
  }
};

const replaceLastTurn = (
  state: ChatStreamState,
  updater: (turn: ChatTurn) => ChatTurn,
): ChatStreamState => {
  if (state.turns.length === 0) return state;
  const lastIndex = state.turns.length - 1;
  const last = state.turns[lastIndex];
  const updated = updater(last);
  if (updated === last) return state;
  const turns = state.turns.slice();
  turns[lastIndex] = updated;
  return { ...state, turns };
};

const updateBlockByIndex = (
  turn: ChatTurn,
  index: number,
  updater: (block: ChatBlock) => ChatBlock | null,
): ChatTurn => {
  const pos = turn.blocks.findIndex((b) => b.index === index);
  if (pos === -1) return turn;
  const current = turn.blocks[pos];
  const next = updater(current);
  if (next === null || next === current) return turn;
  const blocks = turn.blocks.slice();
  blocks[pos] = next;
  return { ...turn, blocks };
};

export function chatStreamReducer(
  state: ChatStreamState,
  frame: unknown,
): ChatStreamState {
  if (!isChatStreamFrame(frame)) return state;

  switch (frame.type) {
    case "turn_start": {
      const newTurn: ChatTurn = {
        sessionId: frame.sessionId,
        blocks: [],
        status: "streaming",
      };
      return {
        ...state,
        turns: [...state.turns, newTurn],
        turnInFlight: true,
      };
    }

    case "block_start": {
      if (state.turns.length === 0) return state;
      return replaceLastTurn(state, (turn) => {
        let newBlock: ChatBlock;
        if (frame.kind === "text") {
          newBlock = { kind: "text", index: frame.index, text: "", done: false };
        } else if (frame.kind === "thinking") {
          newBlock = {
            kind: "thinking",
            index: frame.index,
            thinking: "",
            done: false,
          };
        } else {
          newBlock = {
            kind: "tool_use",
            index: frame.index,
            toolId: frame.toolId,
            toolName: frame.toolName,
            partialJson: "",
            done: false,
          };
        }
        const pos = turn.blocks.findIndex((b) => b.index === frame.index);
        if (pos === -1) {
          return { ...turn, blocks: [...turn.blocks, newBlock] };
        }
        const blocks = turn.blocks.slice();
        blocks[pos] = newBlock;
        return { ...turn, blocks };
      });
    }

    case "block_delta": {
      if (state.turns.length === 0) return state;
      return replaceLastTurn(state, (turn) =>
        updateBlockByIndex(turn, frame.index, (block) => {
          if ("text" in frame) {
            if (block.kind !== "text") return null;
            return { ...block, text: block.text + frame.text };
          }
          if ("thinking" in frame) {
            if (block.kind !== "thinking") return null;
            return { ...block, thinking: block.thinking + frame.thinking };
          }
          if ("partialJson" in frame) {
            if (block.kind !== "tool_use") return null;
            return { ...block, partialJson: block.partialJson + frame.partialJson };
          }
          return null;
        }),
      );
    }

    case "block_stop": {
      if (state.turns.length === 0) return state;
      return replaceLastTurn(state, (turn) =>
        updateBlockByIndex(turn, frame.index, (block) => ({
          ...block,
          done: true,
        })),
      );
    }

    case "tool_result": {
      if (state.turns.length === 0) return state;
      return replaceLastTurn(state, (turn) => {
        const pos = turn.blocks.findIndex(
          (b) => b.kind === "tool_use" && b.toolId === frame.toolUseId,
        );
        if (pos === -1) return turn;
        const current = turn.blocks[pos];
        if (current.kind !== "tool_use") return turn;
        const updated: ChatBlock = {
          ...current,
          result: { content: frame.content, isError: frame.isError },
        };
        const blocks = turn.blocks.slice();
        blocks[pos] = updated;
        return { ...turn, blocks };
      });
    }

    case "turn_end": {
      if (state.turns.length === 0) return state;
      const next = replaceLastTurn(state, (turn) => ({
        ...turn,
        status: "done",
        metrics: {
          durationMs: frame.durationMs,
          costUsd: frame.costUsd,
          inputTokens: frame.inputTokens,
          outputTokens: frame.outputTokens,
          stopReason: frame.stopReason,
        },
      }));
      return { ...next, turnInFlight: false };
    }

    default: {
      const _exhaustive: never = frame;
      void _exhaustive;
      return state;
    }
  }
}
