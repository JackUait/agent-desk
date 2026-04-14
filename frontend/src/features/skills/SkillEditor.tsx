import { Lock, Trash2 } from "lucide-react";
import type { SkillItem } from "./types";
import { FrontmatterForm } from "./FrontmatterForm";
import { SkillMarkdownEditor } from "./SkillMarkdownEditor";

interface Props {
  item: SkillItem;
  frontmatter: Record<string, string>;
  onFrontmatterChange: (next: Record<string, string>) => void;
  body: string;
  onBodyChange: (next: string) => void;
  isDirty: boolean;
  onSave: () => void;
  onRevert: () => void;
  onDelete: () => void;
}

export function SkillEditor({
  item,
  frontmatter,
  onFrontmatterChange,
  body,
  onBodyChange,
  isDirty,
  onSave,
  onRevert,
  onDelete,
}: Props) {
  const readOnly = item.readOnly;
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-bg-card">
      {readOnly && (
        <div className="flex items-center gap-2 border-b border-border-card bg-bg-surface/60 px-4 py-2">
          <Lock width={12} height={12} className="text-text-muted" />
          <span className="text-[12px] text-text-secondary">
            Plugin {item.kind} — read-only
          </span>
        </div>
      )}
      <FrontmatterForm value={frontmatter} onChange={onFrontmatterChange} readOnly={readOnly} />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <SkillMarkdownEditor value={body} onChange={onBodyChange} readOnly={readOnly} />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border-card bg-bg-surface/40 px-4 py-2.5">
        <FileBreadcrumb path={item.path} />
        <div className="flex items-center gap-1.5">
          {!readOnly && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="delete"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted transition hover:bg-red-500/8 hover:text-red-500"
            >
              <Trash2 width={12} height={12} />
              Delete
            </button>
          )}
          <div className="mx-1 h-4 w-px bg-border-card" />
          <button
            type="button"
            onClick={onRevert}
            disabled={!isDirty || readOnly}
            className="rounded-md px-2.5 py-1 text-[12px] text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || readOnly}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary px-3 py-1 text-[12px] font-medium text-bg-page shadow-sm transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FileBreadcrumb({ path }: { path: string }) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    return <div className="font-mono text-[11px] text-text-muted">{path}</div>;
  }
  const head = segments.slice(0, -1);
  const tail = segments[segments.length - 1];
  return (
    <div className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-text-muted">
      {head.map((seg, i) => (
        <span key={`${seg}-${i}`} className="flex items-center gap-1">
          <span className="truncate max-w-[120px]">{seg}</span>
          <span className="text-text-muted/60">/</span>
        </span>
      ))}
      <span className="truncate text-text-secondary">{tail}</span>
    </div>
  );
}
