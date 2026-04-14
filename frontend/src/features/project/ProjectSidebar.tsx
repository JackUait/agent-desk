import { useState } from "react";
import { BookOpenIcon, ChevronsLeftIcon } from "lucide-react";
import { SkillsDialog } from "../skills/SkillsDialog";
import type { Project } from "../../shared/types/domain";

interface Props {
  projects: Project[];
  activeId: string | null;
  onNewProject: () => void;
  onSelect: (id: string) => void;
  onClose?: () => void;
}

const COLOR_VARS = [
  "--color-project-1",
  "--color-project-2",
  "--color-project-3",
  "--color-project-4",
  "--color-project-5",
  "--color-project-6",
];

export function ProjectSidebar({
  projects,
  activeId,
  onNewProject,
  onSelect,
  onClose,
}: Props) {
  const [skillsForProjectId, setSkillsForProjectId] = useState<string | null>(null);
  return (
    <aside className="group/sidebar flex w-[224px] flex-col border-r border-border-hairline bg-bg-page">
      <div className="flex items-center gap-1 px-3 pt-5 pb-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] font-medium text-text-primary transition-colors hover:bg-[rgba(55,53,47,0.04)]"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            aria-hidden
            className="shrink-0 text-accent-blue"
          >
            <rect
              x="1.75"
              y="3.25"
              width="11"
              height="9.5"
              rx="1.75"
              fill="currentColor"
              fillOpacity="0.16"
              stroke="currentColor"
              strokeWidth="1.1"
            />
            <circle cx="12.5" cy="3.5" r="2.35" fill="currentColor" />
          </svg>
          <span className="truncate tracking-[-0.005em]">
            agent<span className="text-text-muted">·</span>desk
          </span>
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="close sidebar"
            onClick={onClose}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-text-muted opacity-0 transition hover:bg-[rgba(55,53,47,0.06)] hover:text-text-secondary group-hover/sidebar:opacity-100"
          >
            <ChevronsLeftIcon width={14} height={14} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {projects.map((p) => {
          const color = `var(${COLOR_VARS[p.colorIdx % 6]})`;
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className="group relative mb-[1px] flex w-full items-center rounded-[5px] transition-colors data-[active=true]:bg-[rgba(55,53,47,0.055)]"
              data-active={active ? "true" : "false"}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-[5px] px-3 py-[5px] text-left text-[13px] text-text-secondary transition-colors hover:text-text-primary data-[active=true]:font-medium data-[active=true]:text-text-primary"
                data-active={active ? "true" : "false"}
              >
                <span
                  className="inline-block h-[7px] w-[7px] shrink-0 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{p.title}</span>
              </button>
              <button
                type="button"
                aria-label={`skills for ${p.title}`}
                data-active={active ? "true" : "false"}
                data-sidepeek-safe
                onClick={() => setSkillsForProjectId(p.id)}
                className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-[3px] text-text-muted opacity-0 transition hover:bg-[rgba(55,53,47,0.06)] hover:text-text-secondary group-hover:opacity-100 data-[active=true]:opacity-100"
              >
                <BookOpenIcon width={12} height={12} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-5 pt-2">
        <button
          type="button"
          onClick={onNewProject}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[5px] px-3 py-[5px] text-left text-[13px] text-text-muted transition-colors hover:text-text-primary"
        >
          <span className="inline-block h-[7px] w-[7px] shrink-0 text-[11px] leading-[7px]">
            +
          </span>
          new project
        </button>
      </div>
      {skillsForProjectId && (
        <SkillsDialog
          open
          scope={{
            kind: "project",
            projectId: skillsForProjectId,
            projectName: projects.find((p) => p.id === skillsForProjectId)?.title,
          }}
          onClose={() => setSkillsForProjectId(null)}
        />
      )}
    </aside>
  );
}
