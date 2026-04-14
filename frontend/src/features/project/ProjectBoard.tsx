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
    <section id={project.id} className="group/board flex flex-col gap-10 scroll-mt-6">
      <ProjectHeader project={project} cardCount={cardCount} onRename={onRename} />
      <div className="flex min-h-0 gap-6 overflow-x-auto">
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
