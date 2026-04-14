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
    <div className="px-10 pt-10 pb-2">
      <input
        aria-label="name"
        value={value.name ?? ""}
        disabled={readOnly}
        onChange={(e) => update("name", e.target.value)}
        placeholder="Untitled"
        spellCheck={false}
        className="w-full min-w-0 border-0 bg-transparent p-0 text-[32px] font-bold tracking-tight text-text-primary outline-none placeholder:text-text-muted/60 disabled:opacity-70"
      />
      <textarea
        ref={descriptionRef}
        aria-label="description"
        value={value.description ?? ""}
        disabled={readOnly}
        onChange={(e) => update("description", e.target.value)}
        placeholder="Add a description…"
        rows={1}
        className="mt-2 w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[14px] leading-relaxed text-text-secondary outline-none placeholder:text-text-muted/60 disabled:opacity-70"
      />
    </div>
  );
}
