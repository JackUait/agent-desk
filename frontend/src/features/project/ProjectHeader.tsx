import { useRef, useState } from "react";
import type { Project } from "../../shared/types/domain";

interface Props {
  project: Project;
  cardCount: number;
  onRename: (title: string) => void;
}

export function ProjectHeader({ project, cardCount, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const created = new Date(project.createdAt * 1000);
  const createdLabel = created.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  function commit() {
    const next = inputRef.current?.value?.trim() ?? "";
    if (next && next !== project.title) onRename(next);
    setEditing(false);
  }

  return (
    <header className="flex items-baseline gap-3">
      {editing ? (
        <input
          ref={inputRef}
          defaultValue={project.title}
          autoFocus
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 border-none bg-transparent p-0 text-[26px] font-semibold tracking-[-0.02em] text-text-primary outline-none"
        />
      ) : (
        <h2
          onDoubleClick={() => setEditing(true)}
          className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary"
        >
          {project.title}
        </h2>
      )}
      <span className="text-[12px] text-text-muted opacity-0 transition-opacity duration-200 group-hover/board:opacity-100">
        {`${cardCount} cards · ${createdLabel}`}
      </span>
    </header>
  );
}
