import type { ChatBlock } from "./chatStream";
import { Markdown } from "../../shared/ui/Markdown";

interface TextBlockProps {
  block: Extract<ChatBlock, { kind: "text" }>;
}

export function TextBlock({ block }: TextBlockProps) {
  const streaming = !block.done;
  return (
    <div
      className="relative flex gap-[10px] py-1"
      data-streaming={streaming}
      data-testid="text-block"
    >
      <div
        aria-hidden="true"
        className={[
          "flex-none w-[2px] rounded-[1px] self-stretch",
          streaming ? "bg-[#14b8a6]" : "bg-border-card",
        ].join(" ")}
      />
      <div className="flex-1 min-w-0 font-sans text-[14px] leading-[1.5] text-text-primary">
        <Markdown>{block.text}</Markdown>
        {streaming && (
          <span
            aria-hidden="true"
            className="inline-block w-[2px] h-[1em] ml-[2px] bg-[#14b8a6] align-text-bottom animate-[blinkCaret_1s_steps(2,start)_infinite]"
          />
        )}
      </div>
    </div>
  );
}
