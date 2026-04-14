import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  prosePluginsCtx,
} from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import "@milkdown/theme-nord/style.css";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history, undo, redo } from "@milkdown/prose/history";
import { keymap } from "@milkdown/prose/keymap";
import { highlightMarkdown } from "./highlight-markdown";

interface EditorProps {
  value: string;
  onChange: (next: string) => void;
  readOnly: boolean;
}

interface Props extends EditorProps {
  raw: boolean;
}

export function SkillMarkdownEditor({ value, onChange, readOnly, raw }: Props) {
  const isEmpty = value.trim().length === 0;
  const rawRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!raw) return;
    const el = rawRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [raw, value]);

  return (
    <div className="relative min-w-0 bg-bg-card">
      {raw ? (
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-10 py-4 font-mono text-[13px] leading-[1.6] text-text-secondary"
          >
            {highlightMarkdown(value)}
            {"\u200B"}
          </div>
          <textarea
            ref={rawRef}
            aria-label="raw markdown"
            value={value}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value)}
            placeholder="# Your skill body&#10;&#10;Write the instructions the agent should follow…"
            spellCheck={false}
            style={{ caretColor: "var(--color-text-primary)" }}
            className="relative block w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent px-10 py-4 font-mono text-[13px] leading-[1.6] text-transparent outline-none selection:bg-accent-blue/25 placeholder:text-text-muted/60"
          />
        </div>
      ) : (
        <>
          <MilkdownView value={value} onChange={onChange} readOnly={readOnly} />
          {isEmpty && !readOnly && (
            <div className="pointer-events-none absolute left-0 right-0 top-0 px-10 py-4 text-[14px] text-text-muted/60">
              Write your skill body…
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MilkdownView({ value, onChange, readOnly }: EditorProps) {
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
        ctx.update(prosePluginsCtx, (prev) => [
          ...prev,
          history(),
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Shift-Mod-z": redo,
          }),
        ]);
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

  return <div ref={hostRef} className="milkdown-host px-10 py-4" />;
}
