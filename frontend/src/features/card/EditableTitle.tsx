import { useEffect, useRef, useState } from "react";

interface EditableTitleProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 500;

export function EditableTitle({ value, onChange, placeholder }: EditableTitleProps) {
  const [local, setLocal] = useState(value);
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

  return (
    <input
      type="text"
      className="w-full bg-transparent text-xl font-semibold text-text-primary outline-none border-b border-transparent focus:border-border-input"
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
      onBlur={flush}
    />
  );
}
