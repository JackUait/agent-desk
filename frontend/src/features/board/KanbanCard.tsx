import type { Card } from "../../shared/types/domain";
import styles from "./KanbanCard.module.css";

const AVATAR_COLORS = ["#e67e22", "#3498db", "#9b59b6", "#1abc9c", "#e74c3c", "#2ecc71"];
const TAG_PALETTE = [
  { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  { backgroundColor: "#f3e8ff", color: "#7c3aed" },
  { backgroundColor: "#fce7f3", color: "#be185d" },
  { backgroundColor: "#d1fae5", color: "#047857" },
  { backgroundColor: "#fef3c7", color: "#b45309" },
  { backgroundColor: "#e0f2fe", color: "#0369a1" },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function getAgentType(name: string): string {
  const i = name.lastIndexOf("-");
  return i > 0 ? name.slice(0, i) : name;
}

interface KanbanCardProps {
  card: Card;
  columnId?: string;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
}

export function KanbanCard({ card, columnId, isEntering, isExiting, isWorking }: KanbanCardProps) {
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

  const agentType = getAgentType(card.agentName);
  const avatarColor = AVATAR_COLORS[hashStr(card.agentName) % AVATAR_COLORS.length];
  const tagStyle = TAG_PALETTE[hashStr(agentType) % TAG_PALETTE.length];
  const isDone = columnId === "col-done";

  return (
    <article className={classNames}>
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
        <span className={styles.tag} style={tagStyle}>
          {agentType}
        </span>
      </div>
      <p className={styles.description}>{card.description}</p>
      <div className={styles.footer}>
        <div className={styles.agent}>
          <span className={styles.avatar} style={{ backgroundColor: avatarColor }}>
            {card.agentName.charAt(0)}
          </span>
          <span className={styles.agentName}>{card.agentName}</span>
        </div>
      </div>
    </article>
  );
}
