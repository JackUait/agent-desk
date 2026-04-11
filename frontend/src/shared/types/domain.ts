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
  | { type: "token"; content: string }
  | { type: "message"; role: string; content: string; id: string; timestamp: number }
  | { type: "card_update"; fields: Partial<Card> }
  | { type: "status"; column: CardColumn }
  | { type: "worktree"; path: string }
  | { type: "pr"; url: string }
  | { type: "error"; message: string };
