import { useEffect, useRef, useState } from "react";
import type { Message } from "../../shared/types/domain";
import type { ChatBlock, ChatStreamState, ChatTurn } from "./chatStream";
import { ChatMessage } from "./ChatMessage";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { TextBlock } from "./TextBlock";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  userMessages: Message[];
  chatStream: ChatStreamState;
  onSend: (content: string) => void;
  readOnly?: boolean;
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
  }
}

function TurnView({ turn, isLast }: { turn: ChatTurn; isLast: boolean }) {
  return (
    <div className={styles.turn} data-testid="assistant-turn">
      <div className={styles.turnBlocks}>{turn.blocks.map(renderBlock)}</div>
      {isLast && turn.status === "streaming" && (
        <div className={styles.streamIndicator} data-testid="turn-streaming">
          <span className={styles.streamDot} aria-hidden="true" />
          <span className={styles.streamLabel}>streaming</span>
        </div>
      )}
      {turn.status === "done" && turn.metrics && (
        <div className={styles.metrics} data-testid="turn-metrics">
          <span>{formatDuration(turn.metrics.durationMs)}</span>
          <span className={styles.metricSep}>·</span>
          <span>{formatCost(turn.metrics.costUsd)}</span>
          <span className={styles.metricSep}>·</span>
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
  readOnly,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [userMessages, chatStream]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    onSend(trimmed);
    setInput("");
  }

  const zipLen = Math.max(userMessages.length, chatStream.turns.length);
  const lastTurnIndex = chatStream.turns.length - 1;

  return (
    <div className={styles.panel} data-testid="chat-panel">
      <div className={styles.messageList} data-testid="message-list">
        {Array.from({ length: zipLen }, (_, i) => {
          const msg = userMessages[i];
          const turn = chatStream.turns[i];
          return (
            <div key={`pair-${i}`} className={styles.pair}>
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
      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={readOnly}
          aria-label="Message input"
        />
        <button
          className={styles.sendButton}
          type="submit"
          disabled={readOnly || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
