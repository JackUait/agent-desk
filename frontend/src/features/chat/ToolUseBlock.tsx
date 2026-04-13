import { useState } from "react";
import type { ChatBlock } from "./chatStream";
import styles from "./ToolUseBlock.module.css";

interface ToolUseBlockProps {
  block: Extract<ChatBlock, { kind: "tool_use" }>;
}

const RESULT_VISIBLE_LINES = 8;

type Status = "running" | "completed" | "error";

function statusFor(block: ToolUseBlockProps["block"]): Status {
  if (block.result?.isError) return "error";
  if (!block.done) return "running";
  return "completed";
}

export function ToolUseBlock({ block }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const status = statusFor(block);
  const statusLabel =
    status === "running"
      ? "running"
      : status === "error"
        ? "error"
        : "completed";

  const resultLines = block.result?.content.split("\n") ?? [];
  const needsTruncation = resultLines.length > RESULT_VISIBLE_LINES;
  const visibleResult =
    !expanded && needsTruncation
      ? resultLines.slice(0, RESULT_VISIBLE_LINES).join("\n")
      : block.result?.content ?? "";

  return (
    <div
      className={styles.block}
      role="group"
      aria-label={`Tool ${block.toolName}`}
      data-status={status}
      data-testid="tool-use-block"
    >
      <div className={styles.header}>
        <span
          className={styles.dot}
          role="img"
          aria-label={`Tool ${statusLabel}`}
        />
        <span className={styles.toolName}>{block.toolName}</span>
      </div>
      {block.partialJson && (
        <pre className={styles.input} data-testid="tool-input">
          {block.partialJson}
        </pre>
      )}
      {block.result && (
        <div className={styles.resultWrap} data-testid="tool-result">
          <div className={styles.divider} aria-hidden="true" />
          <pre
            className={styles.result}
            data-error={block.result.isError ? "true" : "false"}
          >
            {visibleResult}
          </pre>
          {needsTruncation && (
            <button
              type="button"
              className={styles.expand}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? "collapse"
                : `expand (${resultLines.length - RESULT_VISIBLE_LINES} more lines)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
