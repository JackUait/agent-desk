import type { Card } from "../../shared/types/domain";
import styles from "./KanbanCard.module.css";

interface KanbanCardProps {
  card: Card;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
}

export function KanbanCard({ card, isEntering, isExiting, isWorking }: KanbanCardProps) {
  const classNames = [
    styles.card,
    isEntering ? styles.entering : "",
    isExiting ? styles.exiting : "",
    isWorking ? styles.working : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classNames}>
      <div className={styles.header}>
        <h3 className={styles.title}>{card.title}</h3>
      </div>
      <p className={styles.description}>{card.description}</p>
      <div className={styles.footer}>
        <div className={styles.agent}>
          {isWorking && <span className={styles.statusDot} data-testid="agent-status" />}
          <span className={styles.agentName}>{card.agentName}</span>
        </div>
      </div>
    </article>
  );
}
