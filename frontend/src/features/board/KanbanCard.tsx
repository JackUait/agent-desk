import type { Card } from "../../shared/types/domain";
import styles from "./KanbanCard.module.css";

interface KanbanCardProps {
  card: Card;
  columnId?: string;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
  onClick?: () => void;
}

function formatColumn(column: string): string {
  return column.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function KanbanCard({ card, columnId, isEntering, isExiting, isWorking, onClick }: KanbanCardProps) {
  const classNames = [
    styles.card,
    columnId === "col-backlog" ? styles.backlog : "",
    columnId === "col-done" ? styles.done : "",
    isEntering ? styles.entering : "",
    isExiting ? styles.exiting : "",
    isWorking ? styles.working : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isDone = columnId === "col-done";
  const initial = card.id.charAt(0).toUpperCase();

  return (
    <article className={classNames} onClick={onClick}>
      <div className={styles.cardHeader}>
        <div className={isDone ? styles.statusDone : styles.statusOpen} />
        <h3 className={styles.title}>{card.title}</h3>
      </div>
      <div className={styles.tags}>
        {isWorking && (
          <span className={styles.tagWorking} data-testid="agent-status">
            Working
          </span>
        )}
        <span className={styles.tag}>{formatColumn(card.column)}</span>
      </div>
      {card.description && <p className={styles.description}>{card.description}</p>}
      <div className={styles.footer}>
        <div className={styles.agent}>
          <span className={styles.avatar}>{initial}</span>
        </div>
      </div>
    </article>
  );
}
