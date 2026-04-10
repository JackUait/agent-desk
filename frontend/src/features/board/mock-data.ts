import type { Board, Card } from "../../shared/types/domain";

export const MOCK_CARDS: Record<string, Card> = {
  "card-1": {
    id: "card-1",
    title: "Set up CI pipeline",
    description: "Configure GitHub Actions for build and test",
    status: "backlog",
    agentName: "DevOps-1",
    messages: [],
  },
  "card-2": {
    id: "card-2",
    title: "Design auth flow",
    description: "Token-based auth with refresh rotation",
    status: "in-progress",
    agentName: "Architect-1",
    messages: [],
  },
  "card-3": {
    id: "card-3",
    title: "Fix memory leak in worker",
    description: "Goroutine leak in message consumer pool",
    status: "review",
    agentName: "Debug-1",
    messages: [],
  },
  "card-4": {
    id: "card-4",
    title: "Add rate limiting",
    description: "Token bucket per-tenant on ingress",
    status: "backlog",
    agentName: "Backend-1",
    messages: [],
  },
  "card-5": {
    id: "card-5",
    title: "Update dependencies",
    description: "Audit and bump stale transitive deps",
    status: "in-progress",
    agentName: "Deps-1",
    messages: [],
  },
  "card-6": {
    id: "card-6",
    title: "Write integration tests",
    description: "End-to-end coverage for board API",
    status: "backlog",
    agentName: "QA-1",
    messages: [],
  },
};

export const MOCK_BOARD: Board = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-4", "card-6"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-2", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-3"] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

export const COLUMN_ORDER = ["col-backlog", "col-progress", "col-review", "col-done"];
