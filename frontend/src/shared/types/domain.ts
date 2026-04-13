export interface Board {
  id: string;
  title: string;
  columns: Column[];
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export type CardColumn = "backlog" | "in_progress" | "review" | "done";

export interface Card {
  id: string;
  title: string;
  description: string;
  column: CardColumn;
  acceptanceCriteria: string[];
  complexity: string;
  relevantFiles: string[];
  sessionId: string;
  worktreePath: string;
  branchName: string;
  prUrl: string;
  createdAt: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type WSClientMessage =
  | { type: "message"; content: string }
  | { type: "start" }
  | { type: "approve" }
  | { type: "merge" };

export type WSServerMessage =
  | { type: "card_update"; fields: Partial<Card> }
  | { type: "status"; column: CardColumn }
  | { type: "worktree"; path: string }
  | { type: "pr"; url: string }
  | { type: "error"; message: string }
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
