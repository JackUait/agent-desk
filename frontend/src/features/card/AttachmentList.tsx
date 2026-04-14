import { useRef, useState } from "react";
import type { Attachment } from "../../shared/types/domain";

interface AttachmentListProps {
  cardId: string;
  attachments: Attachment[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  hrefFor: (cardId: string, name: string) => string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function AttachmentList({ cardId, attachments, onUpload, onDelete, hrefFor }: AttachmentListProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider m-0">Attachments</h4>
      <ul className="flex flex-col gap-1 m-0 p-0 list-none">
        {attachments.map((a) => (
          <li key={a.name} className="flex items-center justify-between text-[13px] text-text-secondary font-mono">
            <a
              href={hrefFor(cardId, a.name)}
              download
              className="flex-1 truncate text-accent-blue hover:underline"
            >
              {a.name} <span className="text-text-muted">({formatSize(a.size)}, {a.mimeType})</span>
            </a>
            <button
              type="button"
              aria-label={`remove ${a.name}`}
              onClick={() => onDelete(a.name)}
              className="ml-2 text-text-muted hover:text-accent-red"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

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
    </div>
  );
}
