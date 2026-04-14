import type { Card, Column as ColumnType } from "../../shared/types/domain";
import { KanbanCard } from "./KanbanCard";

interface ColumnProps {
  column: ColumnType;
  cards: Record<string, Card>;
  enteringCards?: Set<string>;
  exitingCards?: Set<string>;
  workingCards?: Set<string>;
  onCardClick?: (cardId: string) => void;
  onAddCard?: (position: "top" | "bottom") => void;
}

export function Column({
  column,
  cards,
  enteringCards,
  exitingCards,
  workingCards,
  onCardClick,
  onAddCard,
}: ColumnProps) {
  const empty = column.cardIds.length === 0;
  return (
    <section className="group/col flex min-w-[280px] max-w-[320px] flex-col">
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[12px] font-medium text-text-secondary">
            {column.title}
          </h2>
          <span className="text-[12px] tabular-nums text-text-muted">
            {column.cardIds.length}
          </span>
        </div>
        {onAddCard && (
          <button
            type="button"
            aria-label="Add card to top"
            data-sidepeek-safe
            onClick={() => onAddCard("top")}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-[3px] text-text-muted opacity-0 transition hover:bg-bg-hover hover:text-text-primary group-hover/col:opacity-100"
          >
            +
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {column.cardIds.map((cardId) => {
          const card = cards[cardId];
          if (!card) return null;
          return (
            <KanbanCard
              key={cardId}
              card={card}
              columnId={column.id}
              isEntering={enteringCards?.has(cardId)}
              isExiting={exitingCards?.has(cardId)}
              isWorking={workingCards?.has(cardId)}
              onClick={() => onCardClick?.(cardId)}
            />
          );
        })}
      </div>
      {onAddCard && (
        <button
          type="button"
          data-sidepeek-safe
          onClick={() => onAddCard("bottom")}
          className={
            "mt-2 cursor-pointer rounded-[4px] px-2 py-2 text-left text-[12px] text-text-muted transition hover:bg-bg-hover hover:text-text-primary " +
            (empty ? "opacity-60" : "opacity-0 group-hover/col:opacity-100")
          }
        >
          + Add a card
        </button>
      )}
    </section>
  );
}
