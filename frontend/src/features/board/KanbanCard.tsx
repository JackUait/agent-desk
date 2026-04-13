import type { Card } from "../../shared/types/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  card: Card;
  columnId?: string;
  isEntering?: boolean;
  isExiting?: boolean;
  isWorking?: boolean;
  onClick?: () => void;
}

function formatColumn(column: string): string {
  return column.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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
  const initial = card.id.charAt(0).toUpperCase();

  return (
    <article
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col gap-3 rounded-lg border border-border-card bg-bg-card p-4 transition",
        "hover:bg-bg-hover hover:shadow-sm",
        columnId === "col-backlog" && "opacity-90",
        isDone && "opacity-80",
        isEntering && "entering animate-in fade-in slide-in-from-top-2 duration-300",
        isExiting && "exiting animate-out fade-out slide-out-to-bottom-2 duration-300",
        isWorking && "working ring-1 ring-accent-blue/40",
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            isDone ? "bg-status-done" : "bg-accent-blue",
          )}
        />
        <h3 className="text-sm font-medium leading-snug text-text-primary">
          {card.title}
        </h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {isWorking && (
          <Badge
            data-testid="agent-status"
            variant="secondary"
            className="bg-accent-blue-bg text-accent-blue"
          >
            Working
          </Badge>
        )}
        <Badge variant="outline" className="border-border-card text-text-secondary">
          {formatColumn(card.column)}
        </Badge>
      </div>
      {card.description && (
        <p className="text-xs leading-relaxed text-text-secondary line-clamp-3">
          {card.description}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-hover text-xs font-medium text-text-secondary">
          {initial}
        </span>
      </div>
    </article>
  );
}
