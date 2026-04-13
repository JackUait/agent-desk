import { useEffect, useRef, useState, useCallback, useReducer } from "react";
import type {
  Card,
  CardColumn,
  Message,
  WSClientMessage,
  WSServerMessage,
} from "../types/domain";
import {
  chatStreamReducer,
  initialChatStreamState,
  type ChatStreamState,
} from "../../features/chat/chatStream";

export interface UseCardSocketResult {
  userMessages: Message[];
  chatStream: ChatStreamState;
  sendMessage: (content: string, model?: string) => void;
  sendAction: (type: "start" | "approve" | "merge") => void;
  cardUpdates: Partial<Card>;
  currentColumn: CardColumn | null;
  prUrl: string | null;
  worktreePath: string | null;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
}

export function useCardSocket(cardId: string): UseCardSocketResult {
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [chatStream, dispatchStream] = useReducer(
    chatStreamReducer,
    initialChatStreamState,
  );
  const [cardUpdates, setCardUpdates] = useState<Partial<Card>>({});
  const [currentColumn, setCurrentColumn] = useState<CardColumn | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
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
        case "card_update":
          setCardUpdates((prev) => ({ ...prev, ...msg.fields }));
          return;
        case "status":
          setCurrentColumn(msg.column);
          return;
        case "worktree":
          setWorktreePath(msg.path);
          return;
        case "pr":
          setPrUrl(msg.url);
          return;
        case "error":
          setError(msg.message);
          return;
        default:
          // All remaining variants belong to the typed chat stream;
          // the reducer safely ignores unknown frames.
          dispatchStream(msg);
      }
    };

    return () => {
      ws.close();
    };
  }, [cardId]);

  const sendMessage = useCallback((content: string, model?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const msg: WSClientMessage =
      model && model.length > 0
        ? { type: "message", content, model }
        : { type: "message", content };
    wsRef.current.send(JSON.stringify(msg));
    setUserMessages((prev) => [
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
    userMessages,
    chatStream,
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
