import type { Card, Column as ColumnType } from "../../shared/types/domain";
import { KanbanCard } from "./KanbanCard";
import styles from "./Column.module.css";

interface ColumnProps {
  column: ColumnType;
  cards: Record<string, Card>;
  enteringCards?: Set<string>;
  exitingCards?: Set<string>;
  workingCards?: Set<string>;
}

export function Column({ column, cards, enteringCards, exitingCards, workingCards }: ColumnProps) {
  return (
    <section className={styles.column}>
      <div className={styles.header}>
        <h2 className={styles.title}>{column.title}</h2>
        <span className={styles.count}>{column.cardIds.length}</span>
        <div className={styles.actions}>
          <button className={styles.actionBtn} type="button" aria-label="Refresh">
            ↻
          </button>
          <button className={styles.actionBtn} type="button" aria-label="More options">
            ⋯
          </button>
        </div>
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
            />
          );
        })}
      </div>
      <button className={styles.addTask} type="button">
        <span className={styles.addIcon}>+</span>
        Add Task
      </button>
    </section>
  );
}
