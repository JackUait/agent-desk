import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoOpenNewCards: boolean;
  onAutoOpenNewCardsChange: (value: boolean) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  autoOpenNewCards,
  onAutoOpenNewCardsChange,
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex items-center justify-between border-b border-border-card px-5 py-3.5">
            <DialogPrimitive.Title className="text-[13px] font-semibold text-text-primary">
              Settings
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="close"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
            >
              <XIcon width={15} height={15} />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col">
            <SettingRow
              label="Open new cards immediately"
              hint="Automatically open the card modal when a new card is created."
              checked={autoOpenNewCards}
              onCheckedChange={onAutoOpenNewCardsChange}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
        <span className="text-[12px] leading-[1.45] text-text-secondary">{hint}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} label={label} />
    </div>
  );
}

function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="relative inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer items-center rounded-full border border-border-card bg-bg-page transition-colors data-[checked=true]:border-transparent data-[checked=true]:bg-accent-blue"
    >
      <span className="absolute left-[1px] inline-block h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-150 data-[checked=true]:translate-x-[12px]" data-checked={checked} />
    </button>
  );
}
