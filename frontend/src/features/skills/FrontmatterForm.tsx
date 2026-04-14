import { useLayoutEffect, useRef } from "react";

interface Props {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  readOnly: boolean;
}

export function FrontmatterForm({ value, onChange, readOnly }: Props) {
  const update = (key: string, v: string) => onChange({ ...value, [key]: v });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value.description]);

  return (
    <div className="border-b border-border-card px-6 pt-5 pb-4">
      <div className="flex items-center gap-1.5 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
          Frontmatter
        </span>
        <span className="h-px flex-1 bg-border-hairline" />
      </div>
      <input
        aria-label="name"
        value={value.name ?? ""}
        disabled={readOnly}
        onChange={(e) => update("name", e.target.value)}
        placeholder="untitled-skill"
        spellCheck={false}
        className="w-full min-w-0 border-0 bg-transparent p-0 text-[20px] font-semibold tracking-tight text-text-primary outline-none placeholder:text-text-muted/70 disabled:opacity-70"
      />
      <textarea
        ref={descriptionRef}
        aria-label="description"
        value={value.description ?? ""}
        disabled={readOnly}
        onChange={(e) => update("description", e.target.value)}
        placeholder="One line — when the agent should use this skill"
        rows={1}
        className="mt-1 w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[13px] leading-relaxed text-text-secondary outline-none placeholder:text-text-muted/80 disabled:opacity-70"
      />
    </div>
  );
}
