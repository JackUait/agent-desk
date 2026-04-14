import { useState } from "react";
import { BookOpenIcon } from "lucide-react";
import { SkillsDialog } from "./SkillsDialog";

export function GlobalSkillsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="skills"
        onClick={() => setOpen(true)}
        className="fixed right-14 top-4 z-40 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
      >
        <BookOpenIcon width={16} height={16} />
      </button>
      {open ? (
        <SkillsDialog open={open} scope={{ kind: "global" }} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
