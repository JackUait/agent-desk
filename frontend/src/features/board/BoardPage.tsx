import { useEffect } from "react";
import { useBoard } from "./use-board";
import { Column } from "./Column";
import { CardModal } from "../card";
import { useCardSocket } from "../../shared/api/useCardSocket";
import type { Card } from "../../shared/types/domain";
import styles from "./BoardPage.module.css";

function CardModalWrapper({
  card,
  onClose,
  updateCard,
  moveCardToColumn,
}: {
  card: Card;
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
      onSend={sendMessage}
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

  function handleNewCard() {
    const title = "New Card";
    createCard(title);
  }

  const selectedCard = selectedCardId ? cards[selectedCardId] : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Agent Desk</h1>
        <button className={styles.createBtn} type="button" onClick={handleNewCard}>
          + New Card
        </button>
      </header>
      <div className={styles.board} data-testid="board-container">
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
          onClose={() => selectCard(null)}
          updateCard={updateCard}
          moveCardToColumn={moveCardToColumn}
        />
      )}
    </div>
  );
}
