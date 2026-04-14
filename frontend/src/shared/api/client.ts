import type { Board, Card, Message, Project } from "../types/domain";

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
  // Projects
  listProjects(): Promise<Project[]> {
    return request<Project[]>("/projects");
  },
  createProject(path: string): Promise<Project> {
    return request<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  },
  renameProject(id: string, title: string): Promise<Project> {
    return request<Project>(`/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  },
  deleteProject(id: string): Promise<void> {
    return request<void>(`/projects/${id}`, { method: "DELETE" });
  },
  pickFolder(): Promise<{ path: string; cancelled: boolean }> {
    return request<{ path: string; cancelled: boolean }>("/projects/pick-folder", {
      method: "POST",
    });
  },

  // Cards (project-scoped)
  createCard(projectId: string, title: string): Promise<Card> {
    return request<Card>("/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title }),
    });
  },
  listCards(projectId: string): Promise<Card[]> {
    return request<Card[]>(`/cards?projectId=${encodeURIComponent(projectId)}`);
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
  getBoard(projectId: string): Promise<Board> {
    return request<Board>(`/projects/${projectId}/board`);
  },
  listMessages(id: string): Promise<Message[]> {
    return request<Message[]>(`/cards/${id}/messages`);
  },
};
