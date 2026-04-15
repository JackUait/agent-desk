import type { Card } from "../../shared/types/domain";
import type { ContextUsage } from "../../shared/api/client";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./ProgressBar";
import { BlockedBanner } from "./BlockedBanner";
import { LabelChips } from "./LabelChips";
import { EditableTitle } from "./EditableTitle";
import { EditableDescription } from "./EditableDescription";
import { AttachmentList } from "./AttachmentList";
import { api } from "../../shared/api/client";

export interface ContextBreakdown {
  baseline: number;
  conversation: number;
  cacheRead: number;
  output: number;
  turnCount: number;
}

interface CardContentProps {
  card: Card;
  projectTitle?: string;
  contextTokens?: number;
  contextBreakdown?: ContextBreakdown;
  deepBreakdown?: ContextUsage;
  onApprove: () => void;
  onMerge: () => void;
  onUpdate: (fields: Partial<Card>) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteAttachment: (name: string) => Promise<void>;
}

function formatColumn(column: string): string {
  return column.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatRelative(epochSec: number): string {
  if (!epochSec) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CONTEXT_WINDOW = 200_000;

type Segment = {
  key: string;
  label: string;
  value: number;
  color: string;
  swatch: string;
  hint?: string;
};

function DeepContextBreakdownDiagram({ usage }: { usage: ContextUsage }) {
  const segments: Segment[] = [
    {
      key: "systemPrompt",
      label: "System prompt",
      value: usage.systemPromptTokens,
      color: "#2F6FEB",
      swatch: "bg-[#2F6FEB]",
      hint: "Claude Code's built-in system prompt. Fixed.",
    },
    {
      key: "systemTools",
      label: "System tools",
      value: usage.systemToolsTokens,
      color: "#4F83F7",
      swatch: "bg-[#4F83F7]",
      hint: "Built-in tool definitions (Read/Edit/Bash/Grep/…). Paid every turn.",
    },
    {
      key: "systemToolsDeferred",
      label: "System tools (deferred)",
      value: usage.systemToolsDeferredTokens,
      color: "#6EA0F9",
      swatch: "bg-[#6EA0F9]",
      hint: "Tools loaded on-demand via ToolSearch.",
    },
    {
      key: "mcpTools",
      label: "MCP tools",
      value: usage.mcpToolsTokens,
      color: "#38BDF8",
      swatch: "bg-[#38BDF8]",
      hint: "External MCP servers registered in this project.",
    },
    {
      key: "customAgents",
      label: "Custom agents",
      value: usage.customAgentsTokens,
      color: "#14B8A6",
      swatch: "bg-[#14B8A6]",
      hint: "Agent definitions loaded from plugins / project.",
    },
    {
      key: "memoryFiles",
      label: "Memory files",
      value: usage.memoryFilesTokens,
      color: "#8B5CF6",
      swatch: "bg-[#8B5CF6]",
      hint: "CLAUDE.md files auto-loaded from project and globals.",
    },
    {
      key: "skills",
      label: "Skills",
      value: usage.skillsTokens,
      color: "#A78BFA",
      swatch: "bg-[#A78BFA]",
      hint: "Skill frontmatter indexed for on-demand resolution.",
    },
    {
      key: "messages",
      label: "Messages",
      value: usage.messagesTokens,
      color: "#34D399",
      swatch: "bg-[#34D399]",
      hint: "Conversation history replayed each turn.",
    },
  ];
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div
      data-testid="context-breakdown"
      className="flex flex-col gap-2.5 rounded-md border border-border-card bg-bg-hover/40 p-3"
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-hover">
        {visible.map((s) => (
          <div
            key={s.key}
            data-testid="context-segment"
            data-segment={s.key}
            title={`${s.label}: ${formatTokens(s.value)}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className={`h-2 w-2 rounded-sm ${s.swatch}`} />
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-text-secondary">
                {formatTokens(s.value)}
              </span>
            </div>
            {s.hint && (
              <p className="m-0 pl-3.5 text-[10px] leading-snug text-text-muted">
                {s.hint}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-border-card pt-1.5 text-[11px] text-text-muted">
        From Claude Code /context · {formatTokens(usage.totalTokens)} of{" "}
        {formatTokens(usage.contextWindowTokens)}
      </div>
    </div>
  );
}

function ContextBreakdownDiagram({ breakdown }: { breakdown: ContextBreakdown }) {
  const segments: Segment[] = [
    {
      key: "baseline",
      label: "System + tools + skills",
      value: breakdown.baseline,
      color: "#2F6FEB",
      swatch: "bg-[#2F6FEB]",
      hint: "Built-in prompt, tool defs, MCP servers, and loaded skills. Paid every turn.",
    },
    {
      key: "conversation",
      label: "Conversation history",
      value: breakdown.conversation,
      color: "#8B5CF6",
      swatch: "bg-[#8B5CF6]",
      hint: "User and assistant messages replayed on every turn.",
    },
    {
      key: "cacheRead",
      label: "Cache read",
      value: breakdown.cacheRead,
      color: "#38BDF8",
      swatch: "bg-[#38BDF8]",
      hint: "Tokens served from prompt cache (when caching is enabled).",
    },
    {
      key: "output",
      label: "Output (latest turn)",
      value: breakdown.output,
      color: "#34D399",
      swatch: "bg-[#34D399]",
      hint: "Tokens the model generated on the latest turn.",
    },
  ];
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div
      data-testid="context-breakdown"
      className="flex flex-col gap-2.5 rounded-md border border-border-card bg-bg-hover/40 p-3"
    >
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-hover">
        {visible.map((s) => (
          <div
            key={s.key}
            data-testid="context-segment"
            data-segment={s.key}
            title={`${s.label}: ${formatTokens(s.value)}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.value / total) * 100}%`,
              backgroundColor: s.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className={`h-2 w-2 rounded-sm ${s.swatch}`} />
                {s.label}
              </span>
              <span className="font-mono tabular-nums text-text-secondary">
                {formatTokens(s.value)}
              </span>
            </div>
            {s.hint && (
              <p className="m-0 pl-3.5 text-[10px] leading-snug text-text-muted">
                {s.hint}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-border-card pt-1.5 text-[11px] text-text-muted">
        {breakdown.turnCount} turns in session
      </div>
    </div>
  );
}

export function CardContent({ card, projectTitle, contextTokens = 0, contextBreakdown, deepBreakdown, onApprove, onMerge, onUpdate, onUpload, onDeleteAttachment }: CardContentProps) {
  const ctxTotal = deepBreakdown?.totalTokens ?? contextTokens;
  const ctxWindow = deepBreakdown?.contextWindowTokens ?? CONTEXT_WINDOW;
  const ctxPct = ctxTotal > 0
    ? Math.min(100, Math.round((ctxTotal / ctxWindow) * 100))
    : 0;
  return (
    <div className="flex flex-col gap-4 p-6 overflow-y-auto" data-testid="card-content">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent-blue-bg text-accent-blue">
          {formatColumn(card.column)}
        </span>
        {projectTitle && (
          <span className="text-xs font-mono text-text-muted">{projectTitle}</span>
        )}
      </div>

      <LabelChips labels={card.labels} />

      <EditableTitle
        value={card.title}
        placeholder="New Card"
        onChange={(title) => onUpdate({ title })}
      />

      {card.summary && (
        <p className="text-sm text-text-secondary m-0">{card.summary}</p>
      )}

      {card.progress && (
        <ProgressBar
          step={card.progress.step}
          totalSteps={card.progress.totalSteps}
          currentStep={card.progress.currentStep}
        />
      )}

      {card.blockedReason && <BlockedBanner reason={card.blockedReason} />}

      <EditableDescription value={card.description} onChange={(description) => onUpdate({ description })} />

      <AttachmentList
        cardId={card.id}
        attachments={card.attachments ?? []}
        onUpload={onUpload}
        onDelete={onDeleteAttachment}
        hrefFor={api.attachmentUrl}
      />

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

      {card.branchName && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Branch
          </h4>
          <span
            data-testid="branch-name"
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-bg-hover px-2 py-0.5 text-[13px] font-mono text-text-secondary"
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            {card.branchName}
          </span>
        </div>
      )}

      {ctxTotal > 0 && (
        <div className="flex flex-col gap-2.5" data-testid="context-usage">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">
            Context
          </h4>
          <div className="flex items-center gap-2">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-accent-blue transition-[width]"
                style={{ width: `${ctxPct}%` }}
              />
            </div>
            <span className="text-[12px] font-mono tabular-nums text-text-secondary">
              {formatTokens(ctxTotal)} / {formatTokens(ctxWindow)}
            </span>
          </div>
          {deepBreakdown ? (
            <DeepContextBreakdownDiagram usage={deepBreakdown} />
          ) : (
            contextBreakdown && (
              <ContextBreakdownDiagram breakdown={contextBreakdown} />
            )
          )}
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

      {card.updatedAt > 0 && (
        <span data-testid="updated-at" className="text-[11px] text-text-muted">
          updated {formatRelative(card.updatedAt)}
        </span>
      )}
    </div>
  );
}
