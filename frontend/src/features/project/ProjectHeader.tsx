import { useRef, useState } from "react";
import type { Project } from "../../shared/types/domain";

const COLOR_VARS = [
  "--color-project-1",
  "--color-project-2",
  "--color-project-3",
  "--color-project-4",
  "--color-project-5",
  "--color-project-6",
];

interface Props {
  project: Project;
  cardCount: number;
  onRename: (title: string) => void;
}

export function ProjectHeader({ project, cardCount, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = `var(${COLOR_VARS[project.colorIdx % 6]})`;
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
    <div className="relative flex flex-col gap-2 pl-6">
      <span
        className="absolute left-0 top-0 h-full w-[3px] rounded-full"
        style={{ backgroundColor: color }}
      />
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
          className="w-full border-none bg-transparent p-0 font-mono text-[36px] font-medium tracking-[-0.04em] text-text-primary outline-none"
        />
      ) : (
        <h2
          onDoubleClick={() => setEditing(true)}
          className="font-mono text-[36px] font-medium tracking-[-0.04em] text-text-primary"
        >
          {project.title}
        </h2>
      )}
      <div className="font-sans text-xs text-text-muted">
        {cardCount} cards · created {createdLabel}
      </div>
    </div>
  );
}
