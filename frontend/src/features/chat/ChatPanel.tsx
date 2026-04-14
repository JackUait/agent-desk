import { useEffect, useRef, useState } from "react";
import type { Message, Model } from "../../shared/types/domain";
import type { ChatBlock, ChatStreamState, ChatTurn } from "./chatStream";
import { ChatMessage } from "./ChatMessage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { TextBlock } from "./TextBlock";
import { ModelChooser } from "./ModelChooser";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ChatPanelProps {
  userMessages: Message[];
  chatStream: ChatStreamState;
  onSend: (content: string, model: string) => void;
  models: Model[];
  cardModel: string;
  readOnly?: boolean;
}

const DEFAULT_MODEL = "claude-opus-4-6";
const LAST_MODEL_KEY = "agentDesk.lastModel";

function initialSelectedModel(cardModel: string, models: Model[]): string {
  if (cardModel) return cardModel;
  try {
    const stored = window.localStorage.getItem(LAST_MODEL_KEY);
    if (stored && models.some((m) => m.id === stored)) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_MODEL;
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
  models,
  cardModel,
  readOnly,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    initialSelectedModel(cardModel, models),
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollKey = scrollSignature(userMessages, chatStream);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [scrollKey]);

  // Re-sync selected model when the card's persisted model changes
  // (e.g. a card_update broadcast). Depending only on cardModel here is
  // intentional: local user edits to selectedModel must not be clobbered.
  useEffect(() => {
    if (cardModel) {
      setSelectedModel((current) => (current === cardModel ? current : cardModel));
    }
  }, [cardModel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    onSend(trimmed, selectedModel);
    try {
      window.localStorage.setItem(LAST_MODEL_KEY, selectedModel);
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
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={readOnly || chatStream.turnInFlight}
            />
            <Button
              type="submit"
              size="sm"
              data-testid="send-button"
              disabled={readOnly || !input.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
