import { useEffect } from "react";
import { FolderOpenIcon } from "lucide-react";

interface Props {
  onPickFolder: () => void;
}

export function EmptyState({ onPickFolder }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        onPickFolder();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPickFolder]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-page px-6">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-card bg-bg-card text-text-secondary">
          <FolderOpenIcon width={22} height={22} />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[17px] font-semibold text-text-primary">No projects yet</h1>
          <p className="text-[13px] leading-[1.55] text-text-secondary">
            Pick a folder to start — every project in Agent Desk points at a real repository on your disk.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPickFolder}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-accent-blue px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            Choose folder
          </button>
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <Kbd>⌘</Kbd>
            <Kbd>O</Kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-border-card bg-bg-card px-1 py-[1px] font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  );
}
