import { useState, useCallback } from "react";
import type { Board, Card } from "../../shared/types/domain";

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
  exitingCards: Set<string>;
  enteringCards: Set<string>;
  workingCards: Set<string>;
  moveCard: (cardId: string, fromColumnId: string, toColumnId: string) => void;
  startMove: (cardId: string, fromColumnId: string, toColumnId: string) => void;
  setAgentWorking: (cardId: string, working: boolean) => void;
}

function moveCardInBoard(board: Board, cardId: string, from: string, to: string): Board {
  return {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id === from) {
        return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) };
      }
      if (col.id === to) {
        return { ...col, cardIds: [...col.cardIds, cardId] };
      }
      return col;
    }),
  };
}

export function useBoard(
  initialBoard: Board = EMPTY_BOARD,
  initialCards: Record<string, Card> = {},
): UseBoardResult {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [cards] = useState<Record<string, Card>>(initialCards);
  const [exitingCards, setExitingCards] = useState<Set<string>>(new Set());
  const [enteringCards, setEnteringCards] = useState<Set<string>>(new Set());
  const [workingCards, setWorkingCards] = useState<Set<string>>(new Set());

  const moveCard = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string) => {
      setBoard((prev) => moveCardInBoard(prev, cardId, fromColumnId, toColumnId));
      setEnteringCards((prev) => new Set(prev).add(cardId));
      setTimeout(() => {
        setEnteringCards((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
      }, 500);
    },
    [],
  );

  const startMove = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string) => {
      setExitingCards((prev) => new Set(prev).add(cardId));
      setTimeout(() => {
        setExitingCards((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        moveCard(cardId, fromColumnId, toColumnId);
      }, 400);
    },
    [moveCard],
  );

  const setAgentWorking = useCallback((cardId: string, working: boolean) => {
    setWorkingCards((prev) => {
      const next = new Set(prev);
      if (working) next.add(cardId);
      else next.delete(cardId);
      return next;
    });
  }, []);

  return { board, cards, exitingCards, enteringCards, workingCards, moveCard, startMove, setAgentWorking };
}
