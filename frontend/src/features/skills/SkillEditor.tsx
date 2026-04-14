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
    <div className="flex h-full flex-1 flex-col">
      {readOnly && (
        <div className="border-b border-border-card bg-bg-hover px-4 py-2 text-[12px] text-text-secondary">
          Plugin {item.kind} — read-only
        </div>
      )}
      <FrontmatterForm value={frontmatter} onChange={onFrontmatterChange} readOnly={readOnly} />
      <div className="flex-1 overflow-hidden">
        <SkillMarkdownEditor value={body} onChange={onBodyChange} readOnly={readOnly} />
      </div>
      <div className="flex items-center justify-between border-t border-border-card px-4 py-2">
        <div className="text-[11px] text-text-muted">{item.path}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRevert}
            disabled={!isDirty || readOnly}
            className="rounded-md px-3 py-1 text-[12px] text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || readOnly}
            className="rounded-md bg-text-primary px-3 py-1 text-[12px] text-bg-page transition disabled:opacity-40"
          >
            Save
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-1 text-[12px] text-red-500 transition hover:bg-bg-hover"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
