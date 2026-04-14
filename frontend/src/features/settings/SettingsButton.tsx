import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import { useSettings } from "./use-settings";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const { settings, setAutoOpenNewCards } = useSettings();

  return (
    <>
      <button
        type="button"
        aria-label="settings"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-40 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
      >
        <SettingsIcon width={16} height={16} />
      </button>
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        autoOpenNewCards={settings.autoOpenNewCards}
        onAutoOpenNewCardsChange={setAutoOpenNewCards}
      />
    </>
  );
}
