import { useState } from "react";
import type { SkillKind } from "./types";

interface Props {
  open: boolean;
  defaultKind: SkillKind;
  onClose: () => void;
  onCreate: (kind: SkillKind, name: string) => Promise<void>;
}

export function NewSkillDialog({ open, defaultKind, onClose, onCreate }: Props) {
  const [kind, setKind] = useState<SkillKind>(defaultKind);
  const [name, setName] = useState("");
  if (!open) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(kind, name.trim());
    setName("");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="w-80 rounded-lg bg-bg-card p-4">
        <div className="mb-2 text-[13px] font-semibold text-text-primary">New {kind}</div>
        <label className="mb-2 block text-[11px] uppercase tracking-wide text-text-muted">
          kind
          <select
            aria-label="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SkillKind)}
            className="mt-1 w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case"
          >
            <option value="skill">skill</option>
            <option value="command">command</option>
          </select>
        </label>
        <label className="mb-3 block text-[11px] uppercase tracking-wide text-text-muted">
          name
          <input
            aria-label="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-[12px]">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-text-primary px-3 py-1 text-[12px] text-bg-page">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
