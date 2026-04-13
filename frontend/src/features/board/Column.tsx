import type { Card, Column as ColumnType } from "../../shared/types/domain";
import { Badge } from "@/components/ui/badge";
import { KanbanCard } from "./KanbanCard";

interface ColumnProps {
  column: ColumnType;
  cards: Record<string, Card>;
  enteringCards?: Set<string>;
  exitingCards?: Set<string>;
  workingCards?: Set<string>;
  onCardClick?: (cardId: string) => void;
}

export function Column({ column, cards, enteringCards, exitingCards, workingCards, onCardClick }: ColumnProps) {
  return (
    <section className="flex min-w-[280px] max-w-[320px] flex-col gap-3 rounded-lg bg-bg-hover p-3">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {column.title}
        </h2>
        <Badge variant="outline">{column.cardIds.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
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
    </section>
  );
}
