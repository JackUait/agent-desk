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
import { api } from "./client";

export interface UseCardSocketResult {
  userMessages: Message[];
  chatStream: ChatStreamState;
  sendMessage: (content: string, model?: string, effort?: string) => void;
  sendAction: (type: "start" | "stop" | "approve" | "merge") => void;
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
  // Outgoing messages the user queued while a turn was already in flight.
  // Drained one-by-one on turn_end so the backend (which rejects overlapping
  // Send() calls per card) sees them as sequential turns.
  const queueRef = useRef<
    { content: string; model?: string; effort?: string }[]
  >([]);
  const turnInFlightRef = useRef(false);

  const buildMessageFrame = (
    content: string,
    model?: string,
    effort?: string,
  ): WSClientMessage => {
    const base: {
      type: "message";
      content: string;
      model?: string;
      effort?: string;
    } = { type: "message", content };
    if (model && model.length > 0) base.model = model;
    if (effort && effort.length > 0) base.effort = effort;
    return base;
  };

  useEffect(() => {
    let cancelled = false;
    api.listMessages(cardId).then(
      (msgs) => {
        if (cancelled) return;
        setUserMessages(msgs.filter((m) => m.role === "user"));
        dispatchStream({ type: "hydrate", messages: msgs });
      },
      () => {
        // swallow — empty transcript is the existing default
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cardId]);

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
        case "turn_start":
          turnInFlightRef.current = true;
          dispatchStream(msg);
          return;
        case "turn_end": {
          turnInFlightRef.current = false;
          dispatchStream(msg);
          const next = queueRef.current.shift();
          if (
            next &&
            wsRef.current &&
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            turnInFlightRef.current = true;
            wsRef.current.send(
              JSON.stringify(buildMessageFrame(next.content, next.model, next.effort)),
            );
          }
          return;
        }
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

  const sendMessage = useCallback(
    (content: string, model?: string, effort?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      setUserMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-${prev.length}`,
          role: "user",
          content,
          timestamp: Date.now(),
        },
      ]);
      if (turnInFlightRef.current) {
        queueRef.current.push({ content, model, effort });
        return;
      }
      turnInFlightRef.current = true;
      wsRef.current.send(
        JSON.stringify(buildMessageFrame(content, model, effort)),
      );
    },
    [],
  );

  const sendAction = useCallback(
    (type: "start" | "stop" | "approve" | "merge") => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (type === "stop") {
        queueRef.current = [];
      }
      const msg: WSClientMessage = { type };
      wsRef.current.send(JSON.stringify(msg));
    },
    [],
  );

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
