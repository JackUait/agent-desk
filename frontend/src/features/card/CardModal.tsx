import { useEffect, useRef } from "react";
import { ChevronsRight } from "lucide-react";
import type { Card, Message, Model } from "../../shared/types/domain";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChatPanel } from "../chat";
import type { ChatStreamState } from "../chat";
import { CardContent } from "./CardContent";
import { Dialog } from "@/components/ui/dialog";
import type { PreviewMode } from "../settings";
import {
  requestSidePeek,
  releaseSidePeek,
} from "../../shared/ui/side-peek-coordinator";

const SIDE_PEEK_OWNER_ID = "card";

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
  "fixed right-0 top-0 z-50 grid h-dvh w-[min(1100px,96vw)] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden border-l border-border-card bg-bg-card shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right";

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isSidePeek) return;
    const granted = requestSidePeek(SIDE_PEEK_OWNER_ID, () => {
      onCloseRef.current();
      return true;
    });
    if (!granted) {
      onCloseRef.current();
      return;
    }
    return () => releaseSidePeek(SIDE_PEEK_OWNER_ID);
  }, [isSidePeek]);

  useEffect(() => {
    if (!isSidePeek) return;
    const SAFE_SELECTOR =
      '[data-testid="card-preview-root"],[data-sidepeek-safe],[role="menu"],[role="menuitem"],[role="dialog"],[role="listbox"],[role="option"],[role="tooltip"]';
    let startedInside = false;
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      startedInside =
        target instanceof Element && !!target.closest(SAFE_SELECTOR);
    };
    const onClick = (event: MouseEvent) => {
      if (startedInside) {
        startedInside = false;
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest(SAFE_SELECTOR)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick);
    };
  }, [isSidePeek, onClose]);

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
          {isSidePeek && (
            <button
              type="button"
              aria-label="Close side peek"
              onClick={onClose}
              className="absolute left-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <ChevronsRight width={22} height={22} strokeWidth={1.75} />
            </button>
          )}
          <div className={isSidePeek ? "overflow-y-auto overscroll-contain border-r border-border-card p-6" : "overflow-y-auto border-r border-border-card p-8"}>
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
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
