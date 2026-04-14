import { useRef, useState } from "react";
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

      {attachments.length > 0 && (
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
        </div>
      )}

      <div
        className={`border border-dashed ${dragOver ? "border-accent-blue bg-bg-hover" : "border-border-input"} rounded-md p-3 text-center text-[11px] text-text-muted cursor-pointer`}
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
        Drop files or click to attach
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
      {error && <div role="alert" className="text-[11px] text-accent-red">{error}</div>}

      <AttachmentLightbox
        attachment={openAttachment}
        href={openAttachment ? hrefFor(cardId, openAttachment.name) : ""}
        open={openAttachment !== null}
        onClose={() => setOpenName(null)}
      />
    </div>
  );
}
