interface LabelChipsProps {
  labels: string[];
}

export function LabelChips({ labels }: LabelChipsProps) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l}
          className="inline-block rounded bg-bg-hover px-1.5 py-0.5 text-[11px] text-text-secondary"
        >
          {l}
        </span>
      ))}
    </div>
  );
}
