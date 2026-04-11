import type { Card, Column as ColumnType } from "../../shared/types/domain";
import { KanbanCard } from "./KanbanCard";
import styles from "./Column.module.css";

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
    <section className={styles.column}>
      <div className={styles.header}>
        <h2 className={styles.title}>{column.title}</h2>
        <span className={styles.count}>{column.cardIds.length}</span>
      </div>
      <div className={styles.cardList}>
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
