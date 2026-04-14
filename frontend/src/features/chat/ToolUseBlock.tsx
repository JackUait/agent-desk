import { useState } from "react";
import type { ChatBlock } from "./chatStream";
import { labelForAgentDeskTool } from "./agentDeskToolLabels";

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

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = block.partialJson ? JSON.parse(block.partialJson) : {};
  } catch {
    parsedArgs = {};
  }
  const semanticLabel = labelForAgentDeskTool(block.toolName, parsedArgs);
  const displayLabel = semanticLabel ?? block.toolName;
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

  const dotColor =
    status === "running"
      ? "bg-[#14b8a6]"
      : status === "error"
        ? "bg-[#dc2626]"
        : "bg-text-muted";

  const borderColor =
    status === "running"
      ? "border-[color-mix(in_srgb,#14b8a6_35%,var(--color-border-card))]"
      : status === "error"
        ? "border-[color-mix(in_srgb,#dc2626_35%,var(--color-border-card))]"
        : "border-border-card";

  return (
    <div
      className={[
        "flex flex-col gap-[6px] px-[10px] py-[8px] bg-bg-page border rounded-[4px]",
        borderColor,
      ].join(" ")}
      role="group"
      aria-label={`Tool ${block.toolName} ${statusLabel}`}
      data-status={status}
      data-testid="tool-use-block"
    >
      <div className="flex items-center gap-[8px] font-mono text-[12px]">
        <span
          aria-hidden="true"
          className={[
            "inline-block w-[8px] h-[8px] rounded-full flex-none",
            dotColor,
            status === "running" ? "animate-[blinkDot_1s_ease-in-out_infinite]" : "",
          ].join(" ")}
        />
        <span className="font-mono text-[12px] font-semibold tracking-[0.01em] text-text-primary">
          {displayLabel}
        </span>
      </div>
      {block.partialJson && (
        <pre
          className="m-0 px-[8px] py-[6px] font-mono text-[11px] leading-[1.5] text-text-secondary bg-bg-card border border-border-card rounded-[3px] whitespace-pre-wrap break-words overflow-x-auto"
          data-testid="tool-input"
        >
          {block.partialJson}
        </pre>
      )}
      {block.result && (
        <div className="flex flex-col gap-[6px]" data-testid="tool-result">
          <div aria-hidden="true" className="h-[1px] bg-border-card my-[2px]" />
          <pre
            className={[
              "m-0 px-[8px] py-[6px] font-mono text-[11px] leading-[1.5] bg-bg-card border border-border-card rounded-[3px] whitespace-pre-wrap break-words max-w-full overflow-x-auto",
              block.result.isError
                ? "text-[#dc2626] border-[color-mix(in_srgb,#dc2626_35%,var(--color-border-card))]"
                : "text-text-primary",
            ].join(" ")}
            data-error={block.result.isError ? "true" : "false"}
          >
            {visibleResult}
          </pre>
          {needsTruncation && (
            <button
              type="button"
              className="self-start px-[6px] py-[2px] font-mono text-[10px] lowercase tracking-[0.04em] text-text-secondary bg-transparent border border-border-card rounded-[3px] cursor-pointer hover:text-text-primary hover:border-text-muted"
              onClick={() => setExpanded((v) => !v)}
            >
              {(() => {
                const more = resultLines.length - RESULT_VISIBLE_LINES;
                return expanded ? "collapse" : `expand (${more} more)`;
              })()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
