import type { Card } from "../../shared/types/domain";
import styles from "./CardContent.module.css";

interface CardContentProps {
  card: Card;
  onStart: () => void;
  onApprove: () => void;
  onMerge: () => void;
}

function formatColumn(column: string): string {
  return column.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function CardContent({ card, onStart, onApprove, onMerge }: CardContentProps) {
  return (
    <div className={styles.content} data-testid="card-content">
      <div className={styles.meta}>
        <span className={styles.badge}>{formatColumn(card.column)}</span>
        <span className={styles.cardId}>{card.id.slice(0, 8)}</span>
      </div>

      <h3 className={styles.title}>{card.title}</h3>

      {card.description && <p className={styles.description}>{card.description}</p>}

      {card.acceptanceCriteria.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Acceptance Criteria</h4>
          <ul className={styles.criteriaList}>
            {card.acceptanceCriteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {card.complexity && (
        <div className={styles.section}>
          <span className={styles.complexityTag}>{card.complexity}</span>
        </div>
      )}

      {card.relevantFiles.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Files</h4>
          <ul className={styles.fileList}>
            {card.relevantFiles.map((f, i) => (
              <li key={i} className={styles.filePath}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {card.worktreePath && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Worktree</h4>
          <span className={styles.filePath}>{card.worktreePath}</span>
        </div>
      )}

      {card.prUrl && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Pull Request</h4>
          <a
            className={styles.prLink}
            href={card.prUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {card.prUrl.replace(/^https?:\/\//, "")}
          </a>
        </div>
      )}

      {card.column === "backlog" && (
        <div className={styles.actions}>
          <button className={styles.actionBtn} type="button" onClick={onStart}>
            Start Development
          </button>
        </div>
      )}

      {card.column === "review" && !card.prUrl && (
        <div className={styles.actions}>
          <button className={styles.actionBtn} type="button" onClick={onApprove}>
            Approve
          </button>
        </div>
      )}

      {card.column === "review" && card.prUrl && (
        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${styles.mergeBtn}`}
            type="button"
            onClick={onMerge}
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
}
