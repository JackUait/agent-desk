import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "./use-projects";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectBoard } from "./ProjectBoard";
import { EmptyState } from "./EmptyState";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { CardModal } from "../card";
import { useCardSocket } from "../../shared/api/useCardSocket";
import { useModels } from "../chat";
import { SettingsButton, useSettings } from "../settings";
import type { Card, Model } from "../../shared/types/domain";

function CardModalWrapper({
  card,
  projectTitle,
  models,
  onClose,
  updateCard,
  moveCardToColumn,
}: {
  card: Card;
  projectTitle?: string;
  models: Model[];
  onClose: () => void;
  updateCard: (card: Card) => void;
  moveCardToColumn: (cardId: string, toColumnId: string) => void;
}) {
  const {
    userMessages,
    chatStream,
    sendMessage,
    sendAction,
    cardUpdates,
    currentColumn,
    prUrl,
    worktreePath,
  } = useCardSocket(card.id);

  const mergedCard: Card = {
    ...card,
    ...cardUpdates,
    ...(currentColumn ? { column: currentColumn } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(worktreePath ? { worktreePath } : {}),
  };

  function handleApprove() { sendAction("approve"); }
  function handleMerge() { sendAction("merge"); }
  function handleStop() { sendAction("stop"); }

  useEffect(() => {
    if (currentColumn && currentColumn !== card.column) {
      const columnMap: Record<string, string> = {
        backlog: "col-backlog",
        in_progress: "col-progress",
        review: "col-review",
        done: "col-done",
      };
      updateCard({ ...card, ...cardUpdates, column: currentColumn });
      moveCardToColumn(card.id, columnMap[currentColumn]);
    }
  }, [currentColumn]);

  const cardRef = useRef(card);
  cardRef.current = card;
  const updateCardRef = useRef(updateCard);
  updateCardRef.current = updateCard;
  useEffect(() => {
    if (Object.keys(cardUpdates).length === 0) return;
    updateCardRef.current({ ...cardRef.current, ...cardUpdates });
  }, [cardUpdates]);

  return (
    <CardModal
      card={mergedCard}
      projectTitle={projectTitle}
      userMessages={userMessages}
      chatStream={chatStream}
      models={models}
      onSend={(content, model, effort) => sendMessage(content, model, effort)}
      onStop={handleStop}
      onApprove={handleApprove}
      onMerge={handleMerge}
      onClose={onClose}
    />
  );
}

export function ProjectsPage() {
  const {
    projects,
    boardsByProject,
    cardsByProject,
    selectedCardId,
    activeProjectId,
    setActiveProject,
    createProject,
    renameProject,
    deleteProject,
    createCardInProject,
    selectCard,
    updateCard,
    moveCardToColumn,
  } = useProjects();
  const { models } = useModels();
  const { settings } = useSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    for (const [, cards] of Object.entries(cardsByProject)) {
      if (cards[selectedCardId]) return cards[selectedCardId];
    }
    return null;
  }, [selectedCardId, cardsByProject]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const root = scrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveProject(visible.target.id);
      },
      { root, rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.5, 1] },
    );
    for (const p of projects) {
      const el = document.getElementById(p.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [projects, setActiveProject]);

  function handleSelect(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const deleteTarget = projects.find((p) => p.id === toDelete);

  return (
    <div className="flex h-screen bg-bg-page">
      <SettingsButton />
      <ProjectSidebar
        projects={projects}
        activeId={activeProjectId}
        onNewProject={createProject}
        onSelect={handleSelect}
      />
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <EmptyState onPickFolder={createProject} />
        ) : (
          <div className="flex flex-col gap-16 py-12 pl-12 pr-12">
            {projects.map((p) => (
              <ProjectBoard
                key={p.id}
                project={p}
                board={boardsByProject[p.id] ?? { id: "", title: "", columns: [] }}
                cards={cardsByProject[p.id] ?? {}}
                onNewCard={async (pid, position) => {
                  const card = await createCardInProject(pid, "New Card", position);
                  if (settings.autoOpenNewCards) selectCard(card.id);
                }}
                onRename={(title) => renameProject(p.id, title)}
                onCardClick={(id) => selectCard(id)}
              />
            ))}
          </div>
        )}
      </main>
      {selectedCard && (
        <CardModalWrapper
          card={selectedCard}
          projectTitle={projects.find((p) => p.id === selectedCard.projectId)?.title}
          models={models}
          onClose={() => selectCard(null)}
          updateCard={updateCard}
          moveCardToColumn={moveCardToColumn}
        />
      )}
      {deleteTarget && (
        <DeleteProjectDialog
          project={deleteTarget}
          open={true}
          onCancel={() => setToDelete(null)}
          onConfirm={async (id) => {
            await deleteProject(id);
            setToDelete(null);
          }}
        />
      )}
    </div>
  );
}
