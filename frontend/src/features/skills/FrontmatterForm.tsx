interface Props {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  readOnly: boolean;
}

export function FrontmatterForm({ value, onChange, readOnly }: Props) {
  const update = (key: string, v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-text-muted">
        name
        <input
          aria-label="name"
          value={value.name ?? ""}
          disabled={readOnly}
          onChange={(e) => update("name", e.target.value)}
          className="rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-text-muted">
        description
        <input
          aria-label="description"
          value={value.description ?? ""}
          disabled={readOnly}
          onChange={(e) => update("description", e.target.value)}
          className="rounded-md border border-border-card bg-bg-card px-2 py-1 text-[13px] normal-case text-text-primary"
        />
      </label>
    </div>
  );
}
