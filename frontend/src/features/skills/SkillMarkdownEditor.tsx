import { useState, useEffect, useMemo, useRef } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/theme-nord/style.css";
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

  const stats = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return { words: 0, lines: 0 };
    return {
      words: trimmed.split(/\s+/).length,
      lines: value.split("\n").length,
    };
  }, [value]);

  const isEmpty = value.trim().length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border-hairline px-6 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
            Body
          </span>
          <span className="font-mono text-[10px] tabular-nums text-text-muted/80">
            {stats.words} {stats.words === 1 ? "word" : "words"} · {stats.lines}{" "}
            {stats.lines === 1 ? "line" : "lines"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border-card bg-bg-surface/60 p-0.5">
          <button
            type="button"
            onClick={() => setRaw(false)}
            data-active={!raw}
            className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
          >
            Rendered
          </button>
          <button
            type="button"
            onClick={() => setRaw(true)}
            data-active={raw}
            className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
          >
            Raw
          </button>
        </div>
      </div>
      <div className="relative min-w-0 flex-1 overflow-auto bg-bg-card">
        {raw ? (
          <textarea
            aria-label="raw markdown"
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            placeholder="# Your skill body&#10;&#10;Write the instructions the agent should follow…"
            className="h-full w-full resize-none bg-bg-card px-6 py-5 font-mono text-[13px] leading-[1.6] text-text-primary outline-none placeholder:text-text-muted/70"
          />
        ) : (
          <>
            <MilkdownView value={value} onChange={onChange} readOnly={readOnly} />
            {isEmpty && !readOnly && (
              <div className="pointer-events-none absolute left-0 right-0 top-0 px-6 py-5 text-[14px] text-text-muted/70">
                Start writing your skill — markdown supported.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MilkdownView({ value, onChange, readOnly }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latestValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (value === latestValue.current) return;
    latestValue.current = value;
    setEpoch((e) => e + 1);
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    host.innerHTML = "";
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, latestValue.current);
        ctx.set(editorViewOptionsCtx, { editable: () => !readOnly });
        ctx.get(listenerCtx).markdownUpdated((_, md) => {
          if (md !== latestValue.current) {
            latestValue.current = md;
            onChangeRef.current(md);
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
  }, [readOnly, epoch]);

  return <div ref={hostRef} className="milkdown-host px-6 py-5" />;
}
