import type { Card } from "../../shared/types/domain";
import styles from "./KanbanCard.module.css";

const AVATAR_COLORS = ["#527a9a", "#6b8e5e", "#9b7e5e", "#8b6b87", "#5e8e8b", "#7a6b9b"];
const TAG_PALETTE = [
  { backgroundColor: "#d3e5ef", color: "#28456c" },
  { backgroundColor: "#e8deee", color: "#492f64" },
  { backgroundColor: "#f5e0e9", color: "#69314c" },
  { backgroundColor: "#dbeddb", color: "#2b593f" },
  { backgroundColor: "#fadec9", color: "#854c1d" },
  { backgroundColor: "#fdecc8", color: "#764b00" },
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
