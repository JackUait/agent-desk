import { useState } from "react";
import { Volume2, FileText, FileCode, File as FileIcon } from "lucide-react";
import type { Attachment } from "../../shared/types/domain";
import { mimeCategory } from "./mimeCategory";

interface AttachmentTileProps {
  attachment: Attachment;
  href: string;
  onOpen: (name: string) => void;
  onDelete: (name: string) => void;
}

function GlyphWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg-hover text-text-muted">
      {children}
    </div>
  );
}

export function AttachmentTile({ attachment, href, onOpen, onDelete }: AttachmentTileProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const category = mimeCategory(attachment.mimeType, attachment.name);

  const renderThumb = () => {
    if (category === "image" && !imgFailed) {
      return (
        <img
          src={href}
          alt={attachment.name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }
    if (category === "video") {
      return (
        <video
          src={href}
          preload="metadata"
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }
    if (category === "audio") {
      return (
        <GlyphWrap>
          <Volume2 size={32} />
        </GlyphWrap>
      );
    }
    if (category === "pdf") {
      return (
        <GlyphWrap>
          <FileText size={32} />
        </GlyphWrap>
      );
    }
    if (category === "text") {
      return (
        <GlyphWrap>
          <FileCode size={32} />
        </GlyphWrap>
      );
    }
    return (
      <GlyphWrap>
        <FileIcon size={32} />
      </GlyphWrap>
    );
  };

  return (
    <div className="relative aspect-square rounded-md border border-border-input overflow-hidden cursor-pointer group">
      <button
        type="button"
        aria-label={`open ${attachment.name}`}
        onClick={() => onOpen(attachment.name)}
        className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent border-0 cursor-pointer"
      >
        {renderThumb()}
      </button>
      <button
        type="button"
        aria-label={`remove ${attachment.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(attachment.name);
        }}
        className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-accent-red text-xs"
      >
        ×
      </button>
      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent text-[10px] text-white font-mono truncate pointer-events-none">
        {attachment.name}
      </div>
    </div>
  );
}
