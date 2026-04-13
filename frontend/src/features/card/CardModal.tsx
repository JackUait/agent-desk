import type { Card, Message, Model } from "../../shared/types/domain";
import { ChatPanel } from "../chat";
import type { ChatStreamState } from "../chat";
import { CardContent } from "./CardContent";
import styles from "./CardModal.module.css";

interface CardModalProps {
  card: Card;
  userMessages: Message[];
  chatStream: ChatStreamState;
  models: Model[];
  onSend: (content: string, model: string) => void;
  onStart: () => void;
  onApprove: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export function CardModal({
  card,
  userMessages,
  chatStream,
  models,
  onSend,
  onStart,
  onApprove,
  onMerge,
  onClose,
}: CardModalProps) {
  return (
    <div className={styles.overlay} data-testid="modal-overlay" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.left}>
          <CardContent
            card={card}
            onStart={onStart}
            onApprove={onApprove}
            onMerge={onMerge}
          />
        </div>
        <div className={styles.right}>
          <ChatPanel
            userMessages={userMessages}
            chatStream={chatStream}
            onSend={onSend}
            models={models}
            cardModel={card.model}
            readOnly={card.column === "done"}
          />
        </div>
      </div>
    </div>
  );
}
