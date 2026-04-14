import { useRef, useState } from "react";
import { AlertTriangle, Plus, XIcon } from "lucide-react";
import type { Attachment } from "../../shared/types/domain";
import { AttachmentTile } from "./AttachmentTile";
import { AttachmentLightbox } from "./AttachmentLightbox";

interface AttachmentListProps {
  cardId: string;
  attachments: Attachment[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  hrefFor: (cardId: string, name: string) => string;
}

export function AttachmentList({ cardId, attachments, onUpload, onDelete, hrefFor }: AttachmentListProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    }
  };

  const openAttachment = openName
    ? attachments.find((a) => a.name === openName) ?? null
    : null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">Attachments</h4>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
      >
        {attachments.map((a) => (
          <AttachmentTile
            key={a.name}
            attachment={a}
            href={hrefFor(cardId, a.name)}
            onOpen={setOpenName}
            onDelete={(name) => {
              void onDelete(name);
            }}
          />
        ))}
        <button
          type="button"
          aria-label="Add attachment"
          className={`relative aspect-square rounded-md border border-dashed ${dragOver ? "border-accent-blue bg-bg-hover text-accent-blue" : "border-border-input text-text-muted"} flex items-center justify-center cursor-pointer transition-colors hover:border-accent-blue hover:text-accent-blue hover:bg-bg-hover`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <Plus size={20} strokeWidth={1.5} />
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        data-testid="attachment-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (fileInput.current) fileInput.current.value = "";
        }}
      />
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-[12px] text-accent-red"
        >
          <AlertTriangle width={14} height={14} className="mt-[1px] shrink-0" />
          <span className="flex-1 break-words">{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="shrink-0 rounded-sm p-0.5 text-accent-red/70 transition hover:bg-accent-red/10 hover:text-accent-red"
          >
            <XIcon width={13} height={13} />
          </button>
        </div>
      )}

      <AttachmentLightbox
        attachment={openAttachment}
        href={openAttachment ? hrefFor(cardId, openAttachment.name) : ""}
        open={openAttachment !== null}
        onClose={() => setOpenName(null)}
      />
    </div>
  );
}
