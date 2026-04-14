import { useState } from "react";
import { BookOpenIcon } from "lucide-react";
import { SkillsDialog } from "../skills/SkillsDialog";
import type { Project } from "../../shared/types/domain";

interface Props {
  projects: Project[];
  activeId: string | null;
  onNewProject: () => void;
  onSelect: (id: string) => void;
}

const COLOR_VARS = [
  "--color-project-1",
  "--color-project-2",
  "--color-project-3",
  "--color-project-4",
  "--color-project-5",
  "--color-project-6",
];

export function ProjectSidebar({ projects, activeId, onNewProject, onSelect }: Props) {
  const [skillsForProjectId, setSkillsForProjectId] = useState<string | null>(null);
  return (
    <aside className="flex w-60 flex-col border-r border-border-card bg-[#f2f0eb]">
      <div className="flex-1 overflow-y-auto py-6">
        {projects.map((p) => {
          const color = `var(${COLOR_VARS[p.colorIdx % 6]})`;
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className="group flex w-full items-center gap-2 pr-2 data-[active=true]:bg-bg-hover"
              data-active={active ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex flex-1 cursor-pointer items-center gap-3 px-5 py-2 text-left font-mono text-[13px] tracking-tight text-text-secondary transition data-[active=true]:text-text-primary hover:text-text-primary"
                data-active={active ? "true" : "false"}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{p.title}</span>
              </button>
              <button
                type="button"
                aria-label={`skills for ${p.title}`}
                data-active={active ? "true" : "false"}
                onClick={() => setSkillsForProjectId(p.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted opacity-0 transition hover:bg-bg-hover hover:text-text-primary group-hover:opacity-100 data-[active=true]:opacity-100"
              >
                <BookOpenIcon width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border-card p-4">
        <button
          type="button"
          onClick={onNewProject}
          className="w-full cursor-pointer rounded-md px-3 py-2 text-left font-mono text-[12px] text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
        >
          + new project
        </button>
      </div>
      {skillsForProjectId && (
        <SkillsDialog
          open
          scope={{ kind: "project", projectId: skillsForProjectId }}
          onClose={() => setSkillsForProjectId(null)}
        />
      )}
    </aside>
  );
}
