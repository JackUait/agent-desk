import type { ChatBlock } from "./chatStream";
import styles from "./ThinkingBlock.module.css";

interface ThinkingBlockProps {
  block: Extract<ChatBlock, { kind: "thinking" }>;
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const streaming = !block.done;

  return (
    <div
      className={styles.block}
      role="group"
      aria-label="Thinking"
      data-streaming={streaming}
      data-testid="thinking-block"
    >
      <div className={styles.rail} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.label}>thinking</span>
          {streaming ? (
            <span className={styles.status} aria-hidden="true">
              in progress
            </span>
          ) : (
            <span className={styles.statusDone} aria-hidden="true">
              complete
            </span>
          )}
        </div>
        <p className={styles.text}>{block.thinking}</p>
      </div>
    </div>
  );
}
