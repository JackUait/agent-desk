import { useEffect, useRef, useState } from "react";
import type { Message } from "../../shared/types/domain";
import { ChatMessage } from "./ChatMessage";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  messages: Message[];
  streamingContent: string;
  onSend: (content: string) => void;
  readOnly?: boolean;
}

export function ChatPanel({ messages, streamingContent, onSend, readOnly }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, streamingContent]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className={styles.panel} data-testid="chat-panel">
      <div className={styles.messageList} data-testid="message-list">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {streamingContent && (
          <ChatMessage role="assistant" content="" streaming={streamingContent} />
        )}
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
