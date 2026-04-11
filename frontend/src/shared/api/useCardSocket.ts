import { useEffect, useRef, useState, useCallback } from "react";
import type { Card, CardColumn, Message, WSClientMessage, WSServerMessage } from "../types/domain";

export interface UseCardSocketResult {
  messages: Message[];
  streamingContent: string;
  sendMessage: (content: string) => void;
  sendAction: (type: "start" | "approve" | "merge") => void;
  cardUpdates: Partial<Card>;
  currentColumn: CardColumn | null;
  prUrl: string | null;
  worktreePath: string | null;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
}

export function useCardSocket(cardId: string): UseCardSocketResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [cardUpdates, setCardUpdates] = useState<Partial<Card>>({});
  const [currentColumn, setCurrentColumn] = useState<CardColumn | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/cards/${cardId}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
    };

    ws.onerror = () => {
      setError("WebSocket error");
      setStatus("disconnected");
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: WSServerMessage;
      try {
        msg = JSON.parse(event.data as string) as WSServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "token":
          setStreamingContent((prev) => prev + msg.content);
          break;
        case "message":
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              role: msg.role as "user" | "assistant",
              content: msg.content,
              timestamp: msg.timestamp,
            },
          ]);
          setStreamingContent("");
          break;
        case "card_update":
          setCardUpdates((prev) => ({ ...prev, ...msg.fields }));
          break;
        case "status":
          setCurrentColumn(msg.column);
          break;
        case "worktree":
          setWorktreePath(msg.path);
          break;
        case "pr":
          setPrUrl(msg.url);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, [cardId]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg: WSClientMessage = { type: "message", content };
    wsRef.current.send(JSON.stringify(msg));
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const sendAction = useCallback((type: "start" | "approve" | "merge") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg: WSClientMessage = { type };
    wsRef.current.send(JSON.stringify(msg));
  }, []);

  return {
    messages,
    streamingContent,
    sendMessage,
    sendAction,
    cardUpdates,
    currentColumn,
    prUrl,
    worktreePath,
    status,
    error,
  };
}
