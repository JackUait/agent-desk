import { LockIcon } from "lucide-react";
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
    <div className="flex h-full w-[280px] flex-col border-r border-border-card">
      <div className="p-3">
        <input
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {[...groups.entries()].map(([label, groupItems]) => (
          <div key={label} className="mb-4">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wide text-text-muted">
              {label}
            </div>
            {groupItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                data-active={item.path === selectedPath ? "true" : "false"}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text-secondary transition data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary hover:text-text-primary"
              >
                {item.readOnly && <LockIcon width={12} height={12} className="shrink-0 text-text-muted" />}
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
