import type { Card, Message, Model } from "../../shared/types/domain";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChatPanel } from "../chat";
import type { ChatStreamState } from "../chat";
import { CardContent } from "./CardContent";
import { Dialog } from "@/components/ui/dialog";
import type { PreviewMode } from "../settings";

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
  onUpdate: (fields: Partial<Card>) => void;
  onUpload: (file: File) => Promise<void>;
  onDeleteAttachment: (name: string) => Promise<void>;
  previewMode?: PreviewMode;
}

const MODAL_POPUP_CLASS =
  "fixed left-1/2 top-1/2 z-50 grid w-[min(1200px,94vw)] h-[min(820px,92vh)] -translate-x-1/2 -translate-y-1/2 grid-cols-[1fr_1fr] gap-0 overflow-hidden rounded-xl border border-border-card bg-bg-card p-0 shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const SIDE_PEEK_POPUP_CLASS =
  "fixed right-0 top-0 z-50 flex h-dvh w-[min(640px,96vw)] flex-col overflow-hidden border-l border-border-card bg-bg-card shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right";

const MODAL_BACKDROP_CLASS =
  "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

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
  onUpdate,
  onUpload,
  onDeleteAttachment,
  previewMode = "modal",
}: CardModalProps) {
  const isSidePeek = previewMode === "side-peek";

  return (
    <Dialog
      open
      modal={!isSidePeek}
      disablePointerDismissal={isSidePeek}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <DialogPrimitive.Portal>
        {!isSidePeek && (
          <DialogPrimitive.Backdrop
            data-testid="modal-overlay"
            className={MODAL_BACKDROP_CLASS}
          />
        )}
        <DialogPrimitive.Popup
          data-testid="card-preview-root"
          data-preview-mode={previewMode}
          className={isSidePeek ? SIDE_PEEK_POPUP_CLASS : MODAL_POPUP_CLASS}
        >
          {isSidePeek ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="max-h-[55%] overflow-y-auto border-b border-border-card p-6">
                <CardContent
                  card={card}
                  projectTitle={projectTitle}
                  onApprove={onApprove}
                  onMerge={onMerge}
                  onUpdate={onUpdate}
                  onUpload={onUpload}
                  onDeleteAttachment={onDeleteAttachment}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
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
            </div>
          ) : (
            <>
              <div className="overflow-y-auto border-r border-border-card p-8">
                <CardContent
                  card={card}
                  projectTitle={projectTitle}
                  onApprove={onApprove}
                  onMerge={onMerge}
                  onUpdate={onUpdate}
                  onUpload={onUpload}
                  onDeleteAttachment={onDeleteAttachment}
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
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
