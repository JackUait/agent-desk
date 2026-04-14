import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { skillsApi } from "./skills-api";
import type { SkillContent, SkillItem, SkillKind, SkillScope } from "./types";

function scopeKey(scope: SkillScope): string {
  return scope.kind === "global" ? "global" : `project:${scope.projectId}`;
}

export function useSkills(scope: SkillScope) {
  const [items, setItems] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SkillItem | null>(null);
  const [loadedContent, setLoadedContent] = useState<SkillContent | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftFrontmatter, setDraftFrontmatter] = useState<Record<string, string>>({});

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const key = scopeKey(scope);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await skillsApi.list(scopeRef.current);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback(async (item: SkillItem) => {
    setSelected(item);
    const c = await skillsApi.readContent(scopeRef.current, item.path);
    setLoadedContent(c);
    setDraftBody(c.body);
    setDraftFrontmatter(c.frontmatter);
  }, [key]);

  const isDirty = useMemo(() => {
    if (!loadedContent) return false;
    if (draftBody !== loadedContent.body) return true;
    const keys = new Set([
      ...Object.keys(loadedContent.frontmatter),
      ...Object.keys(draftFrontmatter),
    ]);
    for (const k of keys) {
      if ((loadedContent.frontmatter[k] ?? "") !== (draftFrontmatter[k] ?? "")) return true;
    }
    return false;
  }, [loadedContent, draftBody, draftFrontmatter]);

  const save = useCallback(async () => {
    if (!selected || !loadedContent) return;
    const assembled = assemble(draftFrontmatter, draftBody);
    const c = await skillsApi.writeContent(scopeRef.current, selected.path, assembled);
    setLoadedContent(c);
    setDraftBody(c.body);
    setDraftFrontmatter(c.frontmatter);
  }, [key, selected, loadedContent, draftFrontmatter, draftBody]);

  const revert = useCallback(() => {
    if (!loadedContent) return;
    setDraftBody(loadedContent.body);
    setDraftFrontmatter(loadedContent.frontmatter);
  }, [loadedContent]);

  const create = useCallback(async (kind: SkillKind, name: string) => {
    const item = await skillsApi.create(scopeRef.current, kind, name);
    setItems((prev) => [...prev, item]);
    await select(item);
    return item;
  }, [key, select]);

  const rename = useCallback(async (item: SkillItem, newName: string) => {
    const { newPath } = await skillsApi.rename(scopeRef.current, item.path, newName);
    await refresh();
    return newPath;
  }, [key, refresh]);

  const remove = useCallback(async (item: SkillItem) => {
    await skillsApi.delete(scopeRef.current, item.path);
    setItems((prev) => prev.filter((i) => i.path !== item.path));
    if (selected?.path === item.path) {
      setSelected(null);
      setLoadedContent(null);
      setDraftBody("");
      setDraftFrontmatter({});
    }
  }, [key, selected]);

  return {
    items,
    loading,
    selected,
    loadedContent,
    draftBody,
    draftFrontmatter,
    isDirty,
    refresh,
    select,
    setDraftBody,
    setDraftFrontmatter,
    save,
    revert,
    create,
    rename,
    remove,
  };
}

function assemble(fm: Record<string, string>, body: string): string {
  const keys = Object.keys(fm).filter((k) => fm[k] !== undefined);
  if (keys.length === 0) return body;
  keys.sort();
  const lines = keys.map((k) => `${k}: ${fm[k]}`).join("\n");
  return `---\n${lines}\n---\n${body}`;
}
