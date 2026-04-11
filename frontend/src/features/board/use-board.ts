import { useState, useCallback, useEffect } from "react";
import type { Board, Card } from "../../shared/types/domain";
import { api } from "../../shared/api/client";

const EMPTY_BOARD: Board = {
  id: "board-1",
  title: "Agent Desk",
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
};

export interface UseBoardResult {
  board: Board;
  cards: Record<string, Card>;
  selectedCardId: string | null;
  enteringCards: Set<string>;
  exitingCards: Set<string>;
  workingCards: Set<string>;
  loading: boolean;
  createCard: (title: string) => Promise<void>;
  selectCard: (id: string | null) => void;
  updateCard: (card: Card) => void;
  moveCardToColumn: (cardId: string, toColumnId: string) => void;
  refresh: () => Promise<void>;
}

export function useBoard(): UseBoardResult {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [enteringCards, setEnteringCards] = useState<Set<string>>(new Set());
  const [exitingCards, setExitingCards] = useState<Set<string>>(new Set());
  const [workingCards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [boardData, cardList] = await Promise.all([
        api.getBoard(),
        api.listCards(),
      ]);
      setBoard(boardData);
      const cardMap: Record<string, Card> = {};
      for (const c of cardList) {
        cardMap[c.id] = c;
      }
      setCards(cardMap);
    } catch {
      // keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCard = useCallback(async (title: string) => {
    const card = await api.createCard(title);
    setCards((prev) => ({ ...prev, [card.id]: card }));
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.id === "col-backlog"
          ? { ...col, cardIds: [...col.cardIds, card.id] }
          : col,
      ),
    }));
  }, []);

  const selectCard = useCallback((id: string | null) => {
    setSelectedCardId(id);
  }, []);

  const updateCard = useCallback((card: Card) => {
    setCards((prev) => ({ ...prev, [card.id]: card }));
  }, []);

  const moveCardToColumn = useCallback((cardId: string, toColumnId: string) => {
    setExitingCards((prev) => new Set(prev).add(cardId));
    setTimeout(() => {
      setExitingCards((prev) => {
        const next = new Set(prev);
        next.delete(cardId);
        return next;
      });
      setBoard((prev) => ({
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.cardIds.includes(cardId)) {
            return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) };
          }
          if (col.id === toColumnId) {
            return { ...col, cardIds: [...col.cardIds, cardId] };
          }
          return col;
        }),
      }));
      setEnteringCards((prev) => new Set(prev).add(cardId));
      setTimeout(() => {
        setEnteringCards((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
      }, 500);
    }, 400);
  }, []);

  return {
    board,
    cards,
    selectedCardId,
    enteringCards,
    exitingCards,
    workingCards,
    loading,
    createCard,
    selectCard,
    updateCard,
    moveCardToColumn,
    refresh,
  };
}
