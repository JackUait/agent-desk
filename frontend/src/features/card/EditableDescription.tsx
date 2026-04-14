import { useEffect, useRef, useState } from "react";
import { Markdown } from "../../shared/ui/Markdown";

interface EditableDescriptionProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 500;

export function EditableDescription({ value, onChange, placeholder }: EditableDescriptionProps) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);

  useEffect(() => {
    setLocal(value);
    committed.current = value;
  }, [value]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (local !== committed.current) {
      committed.current = local;
      onChange(local);
    }
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="text-sm leading-relaxed text-text-secondary cursor-text min-h-[48px] rounded p-2 -mx-2 hover:bg-bg-hover"
      >
        {value ? <Markdown>{value}</Markdown> : <span className="text-text-muted">{placeholder ?? "Add a description…"}</span>}
      </div>
    );
  }

  return (
    <textarea
      autoFocus
      className="w-full min-h-[120px] bg-transparent text-sm leading-relaxed text-text-primary outline-none border border-border-input rounded p-2"
      value={local}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (next !== committed.current) {
            committed.current = next;
            onChange(next);
          }
        }, DEBOUNCE_MS);
      }}
      onBlur={() => {
        flush();
        setEditing(false);
      }}
    />
  );
}
