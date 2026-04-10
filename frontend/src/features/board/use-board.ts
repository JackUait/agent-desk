import { useState, useCallback, useRef, useEffect } from "react";
import type { Board, Card } from "../../shared/types/domain";
import { MOCK_BOARD, MOCK_CARDS, COLUMN_ORDER } from "./mock-data";

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

export function useBoard(autoMove = false): UseBoardResult {
  const [board, setBoard] = useState<Board>(MOCK_BOARD);
  const [cards] = useState<Record<string, Card>>(MOCK_CARDS);
  const [exitingCards, setExitingCards] = useState<Set<string>>(new Set());
  const [enteringCards, setEnteringCards] = useState<Set<string>>(new Set());
  const [workingCards, setWorkingCards] = useState<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());

  const moveCard = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string) => {
      setBoard((prev) => moveCardInBoard(prev, cardId, fromColumnId, toColumnId));
      setEnteringCards((prev) => new Set(prev).add(cardId));
      const t = setTimeout(() => {
        setEnteringCards((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        inFlightRef.current.delete(cardId);
      }, 500);
      timersRef.current.push(t);
    },
    [],
  );

  const startMove = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string) => {
      inFlightRef.current.add(cardId);
      setExitingCards((prev) => new Set(prev).add(cardId));

      const t1 = setTimeout(() => {
        setExitingCards((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
        moveCard(cardId, fromColumnId, toColumnId);
      }, 400);
      timersRef.current.push(t1);
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

  useEffect(() => {
    if (!autoMove) return;

    function tick() {
      setBoard((currentBoard) => {
        const movable: { cardId: string; from: string; to: string }[] = [];
        for (let i = 0; i < COLUMN_ORDER.length - 1; i++) {
          const col = currentBoard.columns.find((c) => c.id === COLUMN_ORDER[i]);
          if (col && col.cardIds.length > 0) {
            for (const cardId of col.cardIds) {
              if (!inFlightRef.current.has(cardId)) {
                movable.push({ cardId, from: col.id, to: COLUMN_ORDER[i + 1] });
              }
            }
          }
        }
        if (movable.length === 0) return currentBoard;

        const pick = movable[Math.floor(Math.random() * movable.length)];
        inFlightRef.current.add(pick.cardId);

        setWorkingCards((prev) => new Set(prev).add(pick.cardId));

        const t = setTimeout(() => {
          setWorkingCards((prev) => {
            const next = new Set(prev);
            next.delete(pick.cardId);
            return next;
          });
          startMove(pick.cardId, pick.from, pick.to);
        }, 1200 + Math.random() * 800);
        timersRef.current.push(t);

        return currentBoard;
      });
    }

    const interval = setInterval(tick, 3000 + Math.random() * 3000);

    const initialDelay = setTimeout(tick, 1500);
    timersRef.current.push(initialDelay);

    return () => {
      clearInterval(interval);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [autoMove, startMove]);

  return { board, cards, exitingCards, enteringCards, workingCards, moveCard, startMove, setAgentWorking };
}
