import { Markdown } from "../../shared/ui/Markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  streaming?: string;
}

export function ChatMessage({ role, content, streaming }: ChatMessageProps) {
  const label = role === "user" ? "You" : "Agent";
  const displayContent = streaming !== undefined ? streaming : content;

  const roleClasses =
    role === "user"
      ? "user self-end bg-accent-blue text-white"
      : "assistant self-start bg-bg-hover text-text-primary border border-border-card";

  return (
    <div
      className={[
        "flex flex-col gap-[4px] max-w-[80%] px-[14px] py-[10px] rounded-[10px] font-sans",
        roleClasses,
      ].join(" ")}
    >
      <span className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-70">
        {label}
      </span>
      <div className="text-[14px] leading-[1.5]">
        <Markdown>{displayContent}</Markdown>
      </div>
    </div>
  );
}
