import type { Card, Message, Model } from "../../shared/types/domain";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChatPanel } from "../chat";
import type { ChatStreamState } from "../chat";
import { CardContent } from "./CardContent";
import { Dialog } from "@/components/ui/dialog";

interface CardModalProps {
  card: Card;
  projectTitle?: string;
  userMessages: Message[];
  chatStream: ChatStreamState;
  models: Model[];
  onSend: (content: string, model: string, effort: string) => void;
  onStop?: () => void;
  onApprove: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export function CardModal({
  card,
  projectTitle,
  userMessages,
  chatStream,
  models,
  onSend,
  onStop,
  onApprove,
  onMerge,
  onClose,
}: CardModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-testid="modal-overlay"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Popup
          className="fixed left-1/2 top-1/2 z-50 grid w-[min(1200px,94vw)] h-[min(820px,92vh)] -translate-x-1/2 -translate-y-1/2 grid-cols-[1fr_1fr] gap-0 overflow-hidden rounded-xl border border-border-card bg-bg-card p-0 shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="overflow-y-auto border-r border-border-card p-8">
            <CardContent
              card={card}
              projectTitle={projectTitle}
              onApprove={onApprove}
              onMerge={onMerge}
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <ChatPanel
              userMessages={userMessages}
              chatStream={chatStream}
              onSend={onSend}
              onStop={onStop}
              models={models}
              cardModel={card.model}
              cardEffort={card.effort}
              readOnly={card.column === "done"}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
