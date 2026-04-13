import { useEffect } from "react";
import { useBoard } from "./use-board";
import { Column } from "./Column";
import { CardModal } from "../card";
import { useCardSocket } from "../../shared/api/useCardSocket";
import { useModels } from "../chat";
import type { Card, Model } from "../../shared/types/domain";

function CardModalWrapper({
  card,
  models,
  onClose,
  updateCard,
  moveCardToColumn,
}: {
  card: Card;
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

  function handleStart() {
    sendAction("start");
  }

  function handleApprove() {
    sendAction("approve");
  }

  function handleMerge() {
    sendAction("merge");
  }

  // Sync card updates back to the board
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

  return (
    <CardModal
      card={mergedCard}
      userMessages={userMessages}
      chatStream={chatStream}
      models={models}
      onSend={(content, model) => sendMessage(content, model)}
      onStart={handleStart}
      onApprove={handleApprove}
      onMerge={handleMerge}
      onClose={onClose}
    />
  );
}

export function BoardPage() {
  const {
    board,
    cards,
    selectedCardId,
    enteringCards,
    exitingCards,
    workingCards,
    createCard,
    selectCard,
    updateCard,
    moveCardToColumn,
  } = useBoard();
  const { models } = useModels();

  function handleNewCard() {
    const title = "New Card";
    createCard(title);
  }

  const selectedCard = selectedCardId ? cards[selectedCardId] : null;

  return (
    <div className="flex h-screen flex-col bg-bg-page">
      <header className="flex items-center justify-between border-b border-border-card px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Agent Desk</h1>
        <button
          className="cursor-pointer rounded-md bg-accent-blue px-3.5 py-1.5 text-sm font-medium text-white transition hover:opacity-85"
          type="button"
          onClick={handleNewCard}
        >
          + New Card
        </button>
      </header>
      <div
        className="flex flex-1 min-h-0 gap-4 overflow-x-auto p-6"
        data-testid="board-container"
      >
        {board.columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={cards}
            enteringCards={enteringCards}
            exitingCards={exitingCards}
            workingCards={workingCards}
            onCardClick={selectCard}
          />
        ))}
      </div>
      {selectedCard && (
        <CardModalWrapper
          card={selectedCard}
          models={models}
          onClose={() => selectCard(null)}
          updateCard={updateCard}
          moveCardToColumn={moveCardToColumn}
        />
      )}
    </div>
  );
}
