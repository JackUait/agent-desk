import type { Card } from "../../shared/types/domain";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  card: Card;
  columnId?: string;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
  onClick?: () => void;
}

function timeAgo(sec: number): string {
  if (!sec) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - sec));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function KanbanCard({
  card,
  columnId,
  isEntering,
  isExiting,
  isWorking,
  onClick,
}: KanbanCardProps) {
  const isDone = columnId === "col-done";
  const age = timeAgo(card.createdAt);

  return (
    <article
      data-sidepeek-safe
      onClick={onClick}
      className={cn(
        "relative group/card flex cursor-pointer flex-col gap-1.5 rounded-[6px] bg-bg-card px-3 py-2.5 shadow-[0_1px_0_rgba(55,53,47,0.08),0_1px_2px_rgba(55,53,47,0.04)] transition",
        "hover:shadow-[0_1px_0_rgba(55,53,47,0.12),0_4px_12px_rgba(55,53,47,0.06)]",
        isDone && "opacity-70",
        isEntering && "entering animate-in fade-in slide-in-from-top-2 duration-300",
        isExiting && "exiting animate-out fade-out slide-out-to-bottom-2 duration-300",
        isWorking && "working",
      )}
    >
      <h3
        className={cn(
          "text-[13px] font-medium leading-snug",
          card.title ? "text-text-primary" : "text-text-muted",
        )}
      >
        {card.title || "New Card"}
      </h3>
      {(card.summary || card.description) && (
        <p className="text-[12px] leading-snug text-text-secondary line-clamp-2">
          {card.summary || card.description}
        </p>
      )}
      {card.description && card.summary && (
        <p className="sr-only">{card.description}</p>
      )}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {card.labels.map((l) => (
            <span
              key={l}
              className="rounded-[3px] bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-secondary"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      {card.progress && (
        <div
          role="progressbar"
          aria-valuenow={card.progress.step}
          aria-valuemax={card.progress.totalSteps}
          className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-border-hairline"
        >
          <div
            className="h-full bg-accent-blue"
            style={{
              width: `${Math.min(100, (card.progress.step / Math.max(1, card.progress.totalSteps)) * 100)}%`,
            }}
          />
        </div>
      )}
      {isWorking && (
        <div
          data-testid="agent-status"
          className="flex items-center gap-1.5 pt-0.5 text-[11px] text-accent-blue"
        >
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent-blue/60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-accent-blue" />
          </span>
          working
        </div>
      )}
      {age && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 text-[10px] text-text-muted opacity-0 transition-opacity group-hover/card:opacity-100">
          {age}
        </span>
      )}
      {card.blockedReason && (
        <span
          data-testid="blocked-dot"
          aria-label={`blocked: ${card.blockedReason}`}
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-status-blocked"
        />
      )}
    </article>
  );
}
