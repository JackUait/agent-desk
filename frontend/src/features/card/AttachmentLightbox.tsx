import { useEffect, useState } from "react";
import { DownloadIcon, File as FileIcon, Volume2, XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog";
import type { Attachment } from "../../shared/types/domain";
import { mimeCategory } from "./mimeCategory";

interface AttachmentLightboxProps {
  attachment: Attachment | null;
  href: string;
  open: boolean;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function AttachmentLightbox({
  attachment,
  href,
  open,
  onClose,
}: AttachmentLightboxProps) {
  if (!open || !attachment) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0"
      >
        <div className="flex items-center gap-3 border-b border-border-hairline px-4 py-2">
          <DialogTitle className="truncate text-[13px] font-medium text-text-primary">
            {attachment.name}
          </DialogTitle>
          <span className="truncate text-[12px] text-text-muted">
            {formatSize(attachment.size)} · {attachment.mimeType}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <a
              href={href}
              download
              aria-label="Download"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <DownloadIcon width={14} height={14} />
              Download
            </a>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <XIcon width={15} height={15} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden bg-bg-subtle">
          <Viewer attachment={attachment} href={href} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ViewerProps {
  attachment: Attachment;
  href: string;
}

function Viewer({ attachment, href }: ViewerProps) {
  const category = mimeCategory(attachment.mimeType, attachment.name);

  if (category === "image") {
    return <ImageViewer href={href} name={attachment.name} />;
  }

  if (category === "video") {
    return (
      <video
        src={href}
        controls
        autoPlay
        className="max-w-full max-h-full"
      />
    );
  }

  if (category === "audio") {
    return (
      <div className="flex flex-col items-center gap-4">
        <Volume2 width={72} height={72} className="text-text-muted" />
        <audio src={href} controls />
      </div>
    );
  }

  if (category === "pdf") {
    return (
      <iframe
        src={`${href}#view=FitH`}
        title={attachment.name}
        className="w-full h-full border-0"
      />
    );
  }

  if (category === "text") {
    return <TextViewer href={href} />;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <FileIcon width={72} height={72} className="text-text-muted" />
      <a
        href={href}
        download
        className="inline-flex items-center gap-1 rounded-md border border-border-input px-3 py-1.5 text-[12px] text-text-primary transition hover:bg-bg-hover"
      >
        <DownloadIcon width={14} height={14} />
        Download {attachment.name}
      </a>
    </div>
  );
}

function ImageViewer({ href, name }: { href: string; name: string }) {
  const [fit, setFit] = useState(true);
  return (
    <img
      src={href}
      alt={name}
      onClick={() => setFit((v) => !v)}
      className={`max-w-full max-h-full cursor-zoom-in ${fit ? "object-contain" : "object-none"}`}
    />
  );
}

function TextViewer({ href }: { href: string }) {
  const [state, setState] = useState<{
    status: "loading" | "ok" | "error";
    text: string;
  }>({ status: "loading", text: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", text: "" });
    fetch(href)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setState({ status: "ok", text });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", text: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  if (state.status === "loading") {
    return <div className="text-[12px] text-text-muted">Loading…</div>;
  }
  if (state.status === "error") {
    return <div className="text-[12px] text-accent-red">Failed to load</div>;
  }
  return (
    <pre className="w-full h-full overflow-auto p-4 text-[12px] font-mono whitespace-pre-wrap">
      {state.text}
    </pre>
  );
}
