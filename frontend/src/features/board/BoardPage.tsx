import { useBoard } from "./use-board";
import { Column } from "./Column";
import styles from "./BoardPage.module.css";

export function BoardPage() {
  const { board, cards, enteringCards, exitingCards, workingCards } = useBoard(true);

  return (
    <div className={styles.page}>
      <div className={styles.grain} />
      <header className={styles.header}>
        <h1 className={styles.title}>Agent Desk</h1>
        <p className={styles.subtitle}>Live agent operations</p>
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
          />
        ))}
      </div>
    </div>
  );
}
