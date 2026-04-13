import type { Card } from "../../shared/types/domain";
import { Button } from "@/components/ui/button";

interface CardContentProps {
  card: Card;
  onStart: () => void;
  onApprove: () => void;
  onMerge: () => void;
}

function formatColumn(column: string): string {
  return column.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function CardContent({ card, onStart, onApprove, onMerge }: CardContentProps) {
  return (
    <div className="flex flex-col gap-4 p-6 overflow-y-auto" data-testid="card-content">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent-blue-bg text-accent-blue">
          {formatColumn(card.column)}
        </span>
        <span className="text-xs font-mono text-text-muted">{card.id.slice(0, 8)}</span>
      </div>

      <h3 className="text-xl font-semibold leading-snug text-text-primary m-0">{card.title}</h3>

      {card.description && (
        <p className="text-sm leading-relaxed text-text-secondary m-0">{card.description}</p>
      )}

      {card.acceptanceCriteria.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Acceptance Criteria
          </h4>
          <ul className="m-0 pl-[18px] text-[13px] leading-relaxed text-text-secondary">
            {card.acceptanceCriteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {card.complexity && (
        <div className="flex flex-col gap-1.5">
          <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-bg-hover text-text-secondary">
            {card.complexity}
          </span>
        </div>
      )}

      {card.relevantFiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Files
          </h4>
          <ul className="m-0 p-0 list-none">
            {card.relevantFiles.map((f, i) => (
              <li key={i} className="text-[13px] font-mono text-text-secondary">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.worktreePath && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Worktree
          </h4>
          <span className="text-[13px] font-mono text-text-secondary">{card.worktreePath}</span>
        </div>
      )}

      {card.prUrl && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Pull Request
          </h4>
          <a
            className="text-[13px] text-accent-blue no-underline hover:underline"
            href={card.prUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {card.prUrl.replace(/^https?:\/\//, "")}
          </a>
        </div>
      )}

      {card.column === "backlog" && (
        <div className="flex gap-2 mt-2">
          <Button variant="default" size="sm" type="button" onClick={onStart}>
            Start Development
          </Button>
        </div>
      )}

      {card.column === "review" && !card.prUrl && (
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" size="sm" type="button" onClick={onApprove}>
            Approve
          </Button>
        </div>
      )}

      {card.column === "review" && card.prUrl && (
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" type="button" onClick={onMerge}>
            Merge
          </Button>
        </div>
      )}
    </div>
  );
}
