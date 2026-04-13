import type { Board, Card, Message } from "../types/domain";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  createCard(title: string): Promise<Card> {
    return request<Card>("/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },

  listCards(): Promise<Card[]> {
    return request<Card[]>("/cards");
  },

  getCard(id: string): Promise<Card> {
    return request<Card>(`/cards/${id}`);
  },

  deleteCard(id: string): Promise<void> {
    return request<void>(`/cards/${id}`, { method: "DELETE" });
  },

  mergeCard(id: string): Promise<Card> {
    return request<Card>(`/cards/${id}/merge`, { method: "POST" });
  },

  getBoard(): Promise<Board> {
    return request<Board>("/board");
  },

  listMessages(id: string): Promise<Message[]> {
    return request<Message[]>(`/cards/${id}/messages`);
  },
};
