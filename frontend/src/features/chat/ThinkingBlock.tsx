import type { ChatBlock } from "./chatStream";

interface ThinkingBlockProps {
  block: Extract<ChatBlock, { kind: "thinking" }>;
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const streaming = !block.done;

  return (
    <div
      className="relative flex gap-[10px] py-[6px]"
      role="group"
      aria-label={streaming ? "Thinking, in progress" : "Thinking, complete"}
      data-streaming={streaming}
      data-testid="thinking-block"
    >
      <div
        aria-hidden="true"
        className={[
          "flex-none w-[2px] rounded-[1px] self-stretch",
          streaming
            ? "bg-accent-blue animate-[pulseRail_1.6s_ease-in-out_infinite]"
            : "bg-border-card",
        ].join(" ")}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-[2px]">
          <span className="text-[11px] font-medium text-text-secondary">Thinking</span>
          {streaming ? (
            <span aria-hidden="true" className="text-[11px] text-accent-blue">
              in progress
            </span>
          ) : (
            <span aria-hidden="true" className="text-[11px] text-text-muted">
              complete
            </span>
          )}
        </div>
        <p className="m-0 text-[13px] leading-[1.5] text-text-secondary whitespace-pre-wrap break-words">
          {block.thinking}
        </p>
      </div>
    </div>
  );
}
