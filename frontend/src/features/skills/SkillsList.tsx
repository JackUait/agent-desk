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

  const showGroupHeaders = groups.size > 1;

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-r border-border-hairline bg-bg-surface/20">
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            width={13}
            height={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/70"
          />
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="w-full rounded-md bg-transparent py-1.5 pl-7 pr-2 text-[12.5px] text-text-primary outline-none placeholder:text-text-muted/70 focus:bg-bg-card"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-4">
        {filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 text-center text-[12px] text-text-muted">
            {query ? "No matches" : "Nothing here yet"}
          </div>
        ) : (
          [...groups.entries()].map(([label, groupItems]) => (
            <div key={label} className="mb-2">
              {showGroupHeaders && (
                <div className="px-2 pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted/70">
                  {label}
                </div>
              )}
              <div className="flex flex-col">
                {groupItems.map((item) => {
                  const active = item.path === selectedPath;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      data-active={active ? "true" : "false"}
                      className="group flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left transition data-[active=true]:bg-bg-hover hover:bg-bg-hover/60"
                    >
                      {item.readOnly && (
                        <LockIcon width={10} height={10} className="shrink-0 text-text-muted/60" />
                      )}
                      <span className="truncate text-[13px] text-text-secondary group-data-[active=true]:font-medium group-data-[active=true]:text-text-primary group-hover:text-text-primary">
                        {item.name}
                      </span>
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
