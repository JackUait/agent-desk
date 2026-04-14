import { useEffect, useRef, useState } from "react";
import type { Message, Model } from "../../shared/types/domain";
import type { ChatBlock, ChatStreamState, ChatTurn } from "./chatStream";
import { ChatMessage } from "./ChatMessage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { TextBlock } from "./TextBlock";
import { ModelChooser, type ModelSelection } from "./ModelChooser";
import type { Effort } from "./useModels";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ChatPanelProps {
  userMessages: Message[];
  chatStream: ChatStreamState;
  onSend: (content: string, model: string, effort: string) => void;
  onStop?: () => void;
  models: Model[];
  cardModel: string;
  cardEffort: string;
  readOnly?: boolean;
}

const DEFAULT_MODEL = "claude-opus-4-6";
const DEFAULT_EFFORT: Effort = "medium";
const LAST_SELECTION_KEY = "agentDesk.lastSelection";
const LEGACY_LAST_MODEL_KEY = "agentDesk.lastModel";

function isValidEffort(e: string): e is Effort {
  return e === "low" || e === "medium" || e === "high" || e === "max";
}

function initialSelection(
  cardModel: string,
  cardEffort: string,
  models: Model[],
): ModelSelection {
  // Priority 1: both card fields set
  if (cardModel && cardEffort && isValidEffort(cardEffort)) {
    return { model: cardModel, effort: cardEffort };
  }
  // Priority 2: new localStorage key
  try {
    const stored = window.localStorage.getItem(LAST_SELECTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ModelSelection>;
      if (
        parsed &&
        typeof parsed.model === "string" &&
        models.some((m) => m.id === parsed.model) &&
        typeof parsed.effort === "string" &&
        isValidEffort(parsed.effort)
      ) {
        return { model: parsed.model, effort: parsed.effort };
      }
    }
  } catch {
    /* ignore */
  }
  // Priority 3: legacy migration
  try {
    const legacy = window.localStorage.getItem(LEGACY_LAST_MODEL_KEY);
    if (legacy && models.some((m) => m.id === legacy)) {
      return { model: legacy, effort: DEFAULT_EFFORT };
    }
  } catch {
    /* ignore */
  }
  // Priority 4: hard default
  return { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT };
}

function formatDuration(ms: number): string {
  const rounded = Math.round(ms / 100) * 100;
  if (rounded < 1000) return `${rounded}ms`;
  return `${(rounded / 1000).toFixed(1)}s`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(3)}`;
}

function renderBlock(block: ChatBlock) {
  switch (block.kind) {
    case "text":
      return <TextBlock key={block.index} block={block} />;
    case "thinking":
      return <ThinkingBlock key={block.index} block={block} />;
    case "tool_use":
      return <ToolUseBlock key={block.index} block={block} />;
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

function scrollSignature(userMessages: Message[], chatStream: ChatStreamState): string {
  const last = chatStream.turns[chatStream.turns.length - 1];
  const blockCount = last?.blocks.length ?? 0;
  const status = last?.status ?? "none";
  return `${userMessages.length}|${chatStream.turns.length}|${blockCount}|${status}`;
}

function TurnView({ turn, isLast }: { turn: ChatTurn; isLast: boolean }) {
  return (
    <div className="flex flex-col gap-2" data-testid="assistant-turn">
      <div className="flex flex-col gap-2">{turn.blocks.map(renderBlock)}</div>
      {isLast && turn.status === "streaming" && (
        <div
          className="inline-flex items-center gap-1.5 pt-0.5 font-mono text-[10px] tracking-[0.06em] lowercase text-[var(--stream-accent,#14b8a6)]"
          data-testid="turn-streaming"
        >
          <span
            className="size-1.5 rounded-full bg-[var(--stream-accent,#14b8a6)] animate-[chatStreamPulse_1s_ease-in-out_infinite]"
            aria-hidden="true"
          />
          <span className="text-[var(--stream-accent,#14b8a6)]">streaming</span>
        </div>
      )}
      {turn.status === "done" && turn.metrics && (
        <div
          className="flex items-center gap-1.5 pt-1 font-mono text-[10px] tracking-[0.04em] text-text-muted"
          data-testid="turn-metrics"
        >
          <span>{formatDuration(turn.metrics.durationMs)}</span>
          <span className="opacity-60">·</span>
          <span>{formatCost(turn.metrics.costUsd)}</span>
          <span className="opacity-60">·</span>
          <span>{turn.metrics.outputTokens} tok</span>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  userMessages,
  chatStream,
  onSend,
  onStop,
  models,
  cardModel,
  cardEffort,
  readOnly,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<ModelSelection>(() =>
    initialSelection(cardModel, cardEffort, models),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollKey = scrollSignature(userMessages, chatStream);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [scrollKey]);

  // Re-sync selection when the card's persisted fields change
  // (e.g. a card_update broadcast). Depending on both fields here is
  // intentional: local user edits must not be clobbered.
  useEffect(() => {
    if (cardModel && cardEffort && isValidEffort(cardEffort)) {
      setSelection((current) =>
        current.model === cardModel && current.effort === cardEffort
          ? current
          : { model: cardModel, effort: cardEffort },
      );
    }
  }, [cardModel, cardEffort]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    onSend(trimmed, selection.model, selection.effort);
    try {
      window.localStorage.setItem(
        LAST_SELECTION_KEY,
        JSON.stringify(selection),
      );
      window.localStorage.removeItem(LEGACY_LAST_MODEL_KEY);
    } catch {
      /* ignore */
    }
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const zipLen = Math.max(userMessages.length, chatStream.turns.length);
  const lastTurnIndex = chatStream.turns.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-card" data-testid="chat-panel">
      <div
        className="flex flex-1 min-h-0 flex-col gap-3.5 overflow-y-auto px-4 py-4"
        data-testid="message-list"
      >
        {Array.from({ length: zipLen }, (_, i) => {
          const msg = userMessages[i];
          const turn = chatStream.turns[i];
          return (
            <div key={`pair-${i}`} className="flex flex-col gap-2.5">
              {msg && (
                <ChatMessage
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                />
              )}
              {turn && <TurnView turn={turn} isLast={i === lastTurnIndex} />}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form
        className="border-t border-border-card bg-bg-card p-3"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2 rounded-lg border border-border-card bg-bg-page focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <Textarea
            className="min-h-[60px] max-h-[180px] resize-none rounded-none border-0 bg-transparent px-3 pt-2.5 pb-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={readOnly}
            aria-label="Message input"
            rows={3}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <ModelChooser
              models={models}
              value={selection}
              onChange={setSelection}
              disabled={readOnly || chatStream.turnInFlight}
            />
            {chatStream.turnInFlight ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                data-testid="stop-button"
                onClick={() => onStop?.()}
                disabled={readOnly || !onStop}
                aria-label="Stop agent"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-[1px] bg-current"
                />
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                data-testid="send-button"
                disabled={readOnly || !input.trim()}
              >
                Send
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
