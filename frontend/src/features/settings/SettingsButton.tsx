import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { SearchIcon, SettingsIcon, SquareIcon, PanelRightIcon } from "lucide-react";
import type { PreviewMode } from "./use-settings";
import { useSettings } from "./use-settings";
import { GlobalSkillsButton } from "../skills/GlobalSkillsButton";

export function SettingsButton() {
  const { settings, setAutoOpenNewCards, setPreviewMode } = useSettings();

  return (
    <>
      <GlobalSkillsButton />
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          aria-label="settings"
          className="fixed right-4 top-4 z-40 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary data-popup-open:bg-bg-hover data-popup-open:text-text-primary"
        >
          <SettingsIcon width={16} height={16} />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            sideOffset={8}
            align="end"
            side="bottom"
            className="z-50"
          >
            <PopoverPrimitive.Popup className="w-[320px] origin-[var(--transform-origin)] overflow-hidden rounded-[10px] border border-border-card bg-bg-card text-text-primary shadow-[0_16px_48px_-12px_rgba(12,14,20,0.28),0_2px_6px_-2px_rgba(12,14,20,0.12)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98]">
              <div className="px-3 pt-3 pb-2">
                <label className="flex items-center gap-2 rounded-md border border-border-card bg-bg-page px-2.5 py-1.5 focus-within:border-accent-blue focus-within:ring-2 focus-within:ring-accent-blue/20">
                  <SearchIcon className="h-3.5 w-3.5 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search actions..."
                    className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-secondary"
                  />
                </label>
              </div>

              <div className="border-t border-border-card" />

              <div className="flex flex-col py-1">
                <SettingRow
                  label="Open new cards immediately"
                  hint="Automatically open the card modal when a new card is created."
                  checked={settings.autoOpenNewCards}
                  onCheckedChange={setAutoOpenNewCards}
                />
                <PreviewModeRow
                  value={settings.previewMode}
                  onChange={setPreviewMode}
                />
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
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
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-text-primary">{label}</span>
        <span className="text-[12px] leading-[1.45] text-text-secondary">{hint}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} label={label} />
    </div>
  );
}

function PreviewModeRow({
  value,
  onChange,
}: {
  value: PreviewMode;
  onChange: (value: PreviewMode) => void;
}) {
  const options: { value: PreviewMode; label: string; icon: ReactNode }[] = [
    { value: "modal", label: "Modal", icon: <SquareIcon className="h-3.5 w-3.5" /> },
    { value: "side-peek", label: "Side peek", icon: <PanelRightIcon className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-text-primary">Preview mode</span>
        <span className="text-[12px] leading-[1.45] text-text-secondary">
          Choose how cards and skills open for preview.
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Preview mode"
        className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-border-card bg-bg-page p-1"
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={opt.label}
              data-selected={selected}
              onClick={() => onChange(opt.value)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[12px] font-medium text-text-secondary transition data-[selected=true]:bg-bg-card data-[selected=true]:text-text-primary data-[selected=true]:shadow-[0_1px_2px_rgba(12,14,20,0.08)] hover:text-text-primary"
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
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
      className="relative mt-[2px] inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer items-center rounded-full border border-border-card bg-bg-page transition-colors data-[checked=true]:border-transparent data-[checked=true]:bg-accent-blue"
    >
      <span
        className="absolute left-[1px] inline-block h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-transform duration-150 data-[checked=true]:translate-x-[12px]"
        data-checked={checked}
      />
    </button>
  );
}
