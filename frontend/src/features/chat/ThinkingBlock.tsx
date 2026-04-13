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
            ? "bg-[#14b8a6] animate-[pulseRail_1.6s_ease-in-out_infinite]"
            : "bg-border-card",
        ].join(" ")}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-[10px] mb-[2px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
            thinking
          </span>
          {streaming ? (
            <span
              aria-hidden="true"
              className="font-mono text-[10px] tracking-[0.04em] text-[#14b8a6]"
            >
              in progress
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="font-mono text-[10px] tracking-[0.04em] text-text-muted"
            >
              complete
            </span>
          )}
        </div>
        <p className="m-0 font-sans italic text-[13px] leading-[1.5] text-text-secondary whitespace-pre-wrap break-words">
          {block.thinking}
        </p>
      </div>
    </div>
  );
}
