import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsRightIcon } from "lucide-react";
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
  uploadAttachment,
  deleteAttachment,
}: {
  card: Card;
  projectTitle?: string;
  models: Model[];
  onClose: () => void;
  updateCard: (card: Card) => Promise<void>;
  moveCardToColumn: (cardId: string, toColumnId: string) => void;
  uploadAttachment: (cardId: string, projectId: string, file: File) => Promise<void>;
  deleteAttachment: (cardId: string, projectId: string, name: string) => Promise<void>;
}) {
  const { settings } = useSettings();
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
      onUpdate={(fields) => updateCard({ ...card, ...fields })}
      onUpload={(file) => uploadAttachment(card.id, card.projectId, file)}
      onDeleteAttachment={(name) => deleteAttachment(card.id, card.projectId, name)}
      previewMode={settings.previewMode}
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
    uploadAttachment,
    deleteAttachment,
    moveCardToColumn,
  } = useProjects();
  const { models } = useModels();
  const { settings } = useSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("agentdesk-sidebar-open");
    return v === null ? true : v === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("agentdesk-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  if (projects.length === 0) {
    return (
      <div className="flex h-screen bg-bg-page">
        <SettingsButton />
        <main className="flex-1 overflow-y-auto">
          <EmptyState onPickFolder={createProject} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg-page">
      <SettingsButton />
      {sidebarOpen && (
        <ProjectSidebar
          projects={projects}
          activeId={activeProjectId}
          onNewProject={createProject}
          onSelect={handleSelect}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      {!sidebarOpen && (
        <button
          type="button"
          aria-label="open sidebar"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-3 top-3 z-30 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-muted transition hover:bg-[rgba(55,53,47,0.05)] hover:text-text-primary"
        >
          <ChevronsRightIcon width={16} height={16} strokeWidth={1.75} />
        </button>
      )}
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className={`flex flex-col gap-20 pt-14 pb-20 pr-12 ${
            sidebarOpen ? "pl-12" : "pl-16"
          }`}
        >
          {projects.map((p) => (
            <ProjectBoard
              key={p.id}
              project={p}
              board={boardsByProject[p.id] ?? { id: "", title: "", columns: [] }}
              cards={cardsByProject[p.id] ?? {}}
              onNewCard={async (pid, position) => {
                const card = await createCardInProject(pid, "", position);
                if (settings.autoOpenNewCards || selectedCardId) selectCard(card.id);
              }}
              onRename={(title) => renameProject(p.id, title)}
              onCardClick={(id) => selectCard(id)}
            />
          ))}
        </div>
      </main>
      {selectedCard && (
        <CardModalWrapper
          card={selectedCard}
          projectTitle={projects.find((p) => p.id === selectedCard.projectId)?.title}
          models={models}
          onClose={() => selectCard(null)}
          updateCard={updateCard}
          moveCardToColumn={moveCardToColumn}
          uploadAttachment={uploadAttachment}
          deleteAttachment={deleteAttachment}
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
