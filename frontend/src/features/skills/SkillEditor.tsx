import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const [raw, setRaw] = useState(false);
  const { undo, redo } = useBodyHistory(body, onBodyChange, item.path);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!raw || readOnly) return;
    const meta = event.metaKey || event.ctrlKey;
    if (!meta) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      redo();
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-bg-card">
      {readOnly && (
        <div className="flex items-center gap-2 border-b border-border-hairline px-10 py-2">
          <Lock width={11} height={11} className="text-text-muted" />
          <span className="text-[11.5px] text-text-muted">
            Plugin {item.kind} — read-only
          </span>
        </div>
      )}
      <div
        onKeyDown={handleKeyDown}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      >
        <FrontmatterForm value={frontmatter} onChange={onFrontmatterChange} readOnly={readOnly} />
        <SkillMarkdownEditor
          value={body}
          onChange={onBodyChange}
          readOnly={readOnly}
          raw={raw}
        />
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border-hairline px-5 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <FilePath path={item.path} />
        </div>
        <div className="flex items-center gap-1">
          <div
            role="tablist"
            aria-label="editor mode"
            className="flex items-center rounded-md border border-border-hairline bg-bg-surface/50 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!raw}
              aria-label="show rendered markdown"
              onClick={() => setRaw(false)}
              data-active={!raw}
              className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
            >
              Rendered
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={raw}
              aria-label="show raw markdown"
              onClick={() => setRaw(true)}
              data-active={raw}
              className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
            >
              Raw
            </button>
          </div>
          <span className="mx-1 h-3.5 w-px bg-border-hairline" />
          {!readOnly && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="delete"
              title="Delete"
              className="rounded-md p-1.5 text-text-muted/80 transition hover:bg-red-500/8 hover:text-red-500"
            >
              <Trash2 width={13} height={13} />
            </button>
          )}
          {isDirty && !readOnly && (
            <button
              type="button"
              onClick={onRevert}
              className="rounded-md px-2 py-1 text-[12px] text-text-muted transition hover:text-text-primary"
            >
              Revert
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || readOnly}
            aria-label="save"
            className="rounded-md px-2.5 py-1 text-[12px] font-medium transition data-[dirty=true]:bg-text-primary data-[dirty=true]:text-bg-page data-[dirty=true]:shadow-sm data-[dirty=true]:hover:opacity-90 disabled:pointer-events-none text-text-muted/60"
            data-dirty={isDirty && !readOnly}
          >
            {isDirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}

function useBodyHistory(
  body: string,
  setBody: (next: string) => void,
  key: string,
) {
  const stackRef = useRef<{ past: string[]; future: string[]; current: string }>({
    past: [],
    future: [],
    current: body,
  });
  const lastPushRef = useRef<number>(0);

  useEffect(() => {
    stackRef.current = { past: [], future: [], current: body };
    lastPushRef.current = 0;
    // Reset history whenever the edited item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const state = stackRef.current;
    if (body === state.current) return;
    const now = Date.now();
    const grouped = now - lastPushRef.current < 500 && state.past.length > 0;
    if (!grouped) {
      state.past.push(state.current);
      if (state.past.length > 200) state.past.shift();
    }
    state.current = body;
    state.future = [];
    lastPushRef.current = now;
  }, [body]);

  const undo = useCallback(() => {
    const state = stackRef.current;
    if (state.past.length === 0) return;
    const prev = state.past.pop()!;
    state.future.push(state.current);
    state.current = prev;
    lastPushRef.current = 0;
    setBody(prev);
  }, [setBody]);

  const redo = useCallback(() => {
    const state = stackRef.current;
    if (state.future.length === 0) return;
    const next = state.future.pop()!;
    state.past.push(state.current);
    state.current = next;
    lastPushRef.current = 0;
    setBody(next);
  }, [setBody]);

  return { undo, redo };
}

function FilePath({ path }: { path: string }) {
  const segments = path.split("/").filter(Boolean);
  const tail = segments[segments.length - 1] ?? path;
  return (
    <div
      title={path}
      className="truncate font-mono text-[10.5px] text-text-muted/60"
    >
      {tail}
    </div>
  );
}
