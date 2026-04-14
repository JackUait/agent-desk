import { useCallback, useEffect, useState } from "react";
import type { Board, Card, Project } from "../../shared/types/domain";
import { api } from "../../shared/api/client";

export interface UseProjectsResult {
  projects: Project[];
  cardsByProject: Record<string, Record<string, Card>>;
  boardsByProject: Record<string, Board>;
  selectedCardId: string | null;
  activeProjectId: string | null;
  loading: boolean;
  createProject: () => Promise<void>;
  renameProject: (id: string, title: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createCardInProject: (projectId: string, title: string) => Promise<void>;
  selectCard: (id: string | null) => void;
  updateCard: (card: Card) => void;
  moveCardToColumn: (cardId: string, toColumnId: string) => void;
  setActiveProject: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [cardsByProject, setCardsByProject] = useState<Record<string, Record<string, Card>>>({});
  const [boardsByProject, setBoardsByProject] = useState<Record<string, Board>>({});
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBoardAndCards = useCallback(async (projectId: string) => {
    const [board, cards] = await Promise.all([
      api.getBoard(projectId),
      api.listCards(projectId),
    ]);
    setBoardsByProject((prev) => ({ ...prev, [projectId]: board }));
    setCardsByProject((prev) => ({
      ...prev,
      [projectId]: Object.fromEntries(cards.map((c) => [c.id, c])),
    }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
      await Promise.all(list.map((p) => loadBoardAndCards(p.id)));
    } catch {
      // keep state
    } finally {
      setLoading(false);
    }
  }, [loadBoardAndCards]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(async () => {
    const picked = await api.pickFolder();
    if (picked.cancelled || !picked.path) return;
    const project = await api.createProject(picked.path);
    setProjects((prev) => [...prev, project]);
    await loadBoardAndCards(project.id);
  }, [loadBoardAndCards]);

  const renameProject = useCallback(async (id: string, title: string) => {
    const updated = await api.renameProject(id, title);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setCardsByProject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBoardsByProject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const createCardInProject = useCallback(async (projectId: string, title: string) => {
    const card = await api.createCard(projectId, title);
    setCardsByProject((prev) => ({
      ...prev,
      [projectId]: { ...(prev[projectId] ?? {}), [card.id]: card },
    }));
    setBoardsByProject((prev) => {
      const board = prev[projectId];
      if (!board) return prev;
      return {
        ...prev,
        [projectId]: {
          ...board,
          columns: board.columns.map((col) =>
            col.id === "col-backlog"
              ? { ...col, cardIds: [...col.cardIds, card.id] }
              : col,
          ),
        },
      };
    });
  }, []);

  const selectCard = useCallback((id: string | null) => setSelectedCardId(id), []);

  const updateCard = useCallback((card: Card) => {
    setCardsByProject((prev) => ({
      ...prev,
      [card.projectId]: { ...(prev[card.projectId] ?? {}), [card.id]: card },
    }));
  }, []);

  const moveCardToColumn = useCallback((cardId: string, toColumnId: string) => {
    setBoardsByProject((prev) => {
      const next: typeof prev = {};
      for (const [pid, board] of Object.entries(prev)) {
        next[pid] = {
          ...board,
          columns: board.columns.map((col) => {
            if (col.cardIds.includes(cardId)) {
              return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) };
            }
            if (col.id === toColumnId) {
              return { ...col, cardIds: [...col.cardIds, cardId] };
            }
            return col;
          }),
        };
      }
      return next;
    });
  }, []);

  const setActiveProject = useCallback((id: string | null) => setActiveProjectId(id), []);

  return {
    projects,
    cardsByProject,
    boardsByProject,
    selectedCardId,
    activeProjectId,
    loading,
    createProject,
    renameProject,
    deleteProject,
    createCardInProject,
    selectCard,
    updateCard,
    moveCardToColumn,
    setActiveProject,
    refresh,
  };
}
