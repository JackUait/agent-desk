import type { SkillContent, SkillItem, SkillKind, SkillScope } from "./types";
import { scopeQuery } from "./types";

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

function scopeBody(scope: SkillScope): Record<string, string> {
  return scope.kind === "global"
    ? { scope: "global" }
    : { scope: "project", projectId: scope.projectId };
}

export const skillsApi = {
  list(scope: SkillScope): Promise<{ items: SkillItem[] }> {
    return request(`/skills?${scopeQuery(scope)}`);
  },
  readContent(scope: SkillScope, path: string): Promise<SkillContent> {
    return request(
      `/skills/content?${scopeQuery(scope)}&path=${encodeURIComponent(path)}`,
    );
  },
  writeContent(scope: SkillScope, path: string, content: string): Promise<SkillContent> {
    return request("/skills/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), path, content }),
    });
  },
  create(scope: SkillScope, kind: SkillKind, name: string, body = ""): Promise<SkillItem> {
    return request("/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), kind, name, body }),
    });
  },
  rename(scope: SkillScope, path: string, newName: string): Promise<{ newPath: string }> {
    return request("/skills/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scopeBody(scope), path, newName }),
    });
  },
  delete(scope: SkillScope, path: string): Promise<void> {
    return request(`/skills?${scopeQuery(scope)}&path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
  },
};
