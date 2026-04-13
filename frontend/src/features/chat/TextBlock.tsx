import type { ChatBlock } from "./chatStream";
import styles from "./TextBlock.module.css";

interface TextBlockProps {
  block: Extract<ChatBlock, { kind: "text" }>;
}

export function TextBlock({ block }: TextBlockProps) {
  const streaming = !block.done;
  return (
    <div
      className={styles.block}
      data-streaming={streaming}
      data-testid="text-block"
    >
      <div className={styles.rail} aria-hidden="true" />
      <p className={styles.text}>
        {block.text}
        {streaming && <span className={styles.caret} aria-hidden="true" />}
      </p>
    </div>
  );
}
