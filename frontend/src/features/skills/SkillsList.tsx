import { LockIcon, Search } from "lucide-react";
import type { SkillItem, SkillKind } from "./types";

interface Props {
  items: SkillItem[];
  kind: SkillKind;
  selectedPath: string | null;
  onSelect: (item: SkillItem) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SkillsList({ items, kind, selectedPath, onSelect, query, onQueryChange }: Props) {
  const filtered = items
    .filter((i) => i.kind === kind)
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  const groups = new Map<string, SkillItem[]>();
  for (const item of filtered) {
    const label = item.source === "user" ? "User" : `Plugin: ${item.pluginName ?? "unknown"}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-border-card bg-bg-surface/30">
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            width={13}
            height={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="w-full rounded-md border border-border-card bg-bg-card py-1.5 pl-7 pr-2 text-[12.5px] text-text-primary shadow-sm outline-none placeholder:text-text-muted focus:border-border-strong"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtered.length === 0 ? (
          <div className="mx-1 mt-4 rounded-md border border-dashed border-border-card bg-bg-card/40 px-3 py-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              {query ? "No matches" : "Empty"}
            </div>
            <div className="mt-1 text-[12px] text-text-secondary">
              {query ? "Try a different search" : "Create one to get started"}
            </div>
          </div>
        ) : (
          [...groups.entries()].map(([label, groupItems]) => (
            <div key={label} className="mb-3">
              <div className="flex items-center justify-between px-2 pt-2 pb-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
                  {label}
                </div>
                <div className="font-mono text-[10px] tabular-nums text-text-muted">
                  {groupItems.length}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => {
                  const active = item.path === selectedPath;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      data-active={active ? "true" : "false"}
                      className="group flex w-full flex-col gap-0.5 rounded-md border border-transparent px-2.5 py-1.5 text-left transition data-[active=true]:border-border-card data-[active=true]:bg-bg-card data-[active=true]:shadow-sm hover:bg-bg-hover"
                    >
                      <div className="flex items-center gap-1.5">
                        {item.readOnly && (
                          <LockIcon width={11} height={11} className="shrink-0 text-text-muted" />
                        )}
                        <span
                          className="truncate text-[13px] font-medium text-text-secondary group-data-[active=true]:text-text-primary group-hover:text-text-primary"
                        >
                          {item.name}
                        </span>
                      </div>
                      {item.description && (
                        <span className="line-clamp-1 pl-0 text-[11.5px] text-text-muted">
                          {item.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
