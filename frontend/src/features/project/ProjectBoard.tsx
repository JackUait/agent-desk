import type { Board, Card, Project } from "../../shared/types/domain";
import { Column } from "../board/Column";
import { ProjectHeader } from "./ProjectHeader";

interface Props {
  project: Project;
  board: Board;
  cards: Record<string, Card>;
  onNewCard: (projectId: string, position?: "top" | "bottom") => void;
  onRename: (title: string) => void;
  onCardClick: (id: string) => void;
}

export function ProjectBoard({
  project,
  board,
  cards,
  onNewCard,
  onRename,
  onCardClick,
}: Props) {
  const cardCount = Object.keys(cards).length;
  return (
    <section id={project.id} className="flex flex-col gap-8 scroll-mt-6">
      <div className="flex items-center justify-between gap-4">
        <ProjectHeader project={project} cardCount={cardCount} onRename={onRename} />
        <button
          type="button"
          onClick={() => onNewCard(project.id)}
          className="cursor-pointer rounded-md bg-accent-blue px-3.5 py-1.5 font-mono text-[12px] text-white transition hover:opacity-85"
        >
          + new card
        </button>
      </div>
      <div className="flex min-h-0 gap-4 overflow-x-auto">
        {board.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={cards}
            enteringCards={new Set()}
            exitingCards={new Set()}
            workingCards={new Set()}
            onCardClick={onCardClick}
            onAddCard={
              column.id === "col-backlog"
                ? (position) => onNewCard(project.id, position)
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
