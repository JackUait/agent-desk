import { useState, useEffect, useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}

export function SkillMarkdownEditor({ value, onChange, readOnly }: Props) {
  const [raw, setRaw] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border-card px-3 py-1">
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          className="rounded-md px-2 py-1 text-[11px] uppercase tracking-wide text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          {raw ? "Rendered" : "Raw"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {raw ? (
          <textarea
            aria-label="raw markdown"
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none bg-bg-card p-4 font-mono text-[13px] text-text-primary outline-none"
          />
        ) : (
          <MilkdownView value={value} onChange={onChange} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}

function MilkdownView({ value, onChange, readOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latestValue = useRef(value);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, latestValue.current);
        ctx.set(editorViewOptionsCtx, { editable: () => !readOnly });
        ctx.get(listenerCtx).markdownUpdated((_, md) => {
          if (md !== latestValue.current) {
            latestValue.current = md;
            onChange(md);
          }
        });
      })
      .config(nord)
      .use(commonmark)
      .use(gfm)
      .use(listener);
    editor.create().catch(() => {
      /* swallow — JSDOM / SSR paths */
    });
    return () => {
      editor.destroy().catch(() => {});
      host.innerHTML = "";
    };
  }, [readOnly, onChange]);

  return <div ref={hostRef} className="milkdown-host p-4" />;
}
