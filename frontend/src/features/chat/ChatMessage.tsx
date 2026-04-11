import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  streaming?: string;
}

export function ChatMessage({ role, content, streaming }: ChatMessageProps) {
  const label = role === "user" ? "You" : "Agent";
  const displayContent = streaming !== undefined ? streaming : content;

  return (
    <div className={`${styles.message} ${styles[role]}`}>
      <span className={styles.label}>{label}</span>
      <p className={styles.content}>{displayContent}</p>
    </div>
  );
}
