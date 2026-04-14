interface Props {
  onPickFolder: () => void;
}

export function EmptyState({ onPickFolder }: Props) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex max-w-[480px] flex-col gap-6">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
          00 / 00 projects
        </span>
        <h1 className="text-[36px] font-medium leading-none text-text-primary">pick a folder.</h1>
        <p className="text-sm text-text-secondary">
          every project in agent desk is a real repo on your disk.
        </p>
        <button
          type="button"
          onClick={onPickFolder}
          className="w-fit cursor-pointer rounded-md bg-accent-blue px-4 py-2 font-mono text-[13px] text-white transition hover:opacity-85"
        >
          choose folder →
        </button>
      </div>
    </div>
  );
}
