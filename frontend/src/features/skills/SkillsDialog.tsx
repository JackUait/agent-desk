import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { SkillKind, SkillScope } from "./types";
import { useSkills } from "./use-skills";
import { SkillsList } from "./SkillsList";
import { SkillEditor } from "./SkillEditor";
import { NewSkillDialog } from "./NewSkillDialog";
import { DeleteSkillConfirm } from "./DeleteSkillConfirm";
import { useSettings } from "../settings";

interface Props {
  open: boolean;
  scope: SkillScope;
  onClose: () => void;
}

export function SkillsDialog({ open, scope, onClose }: Props) {
  const skills = useSkills(scope);
  const { settings } = useSettings();
  const [kind, setKind] = useState<SkillKind>("skill");
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const isSidePeek = settings.previewMode === "side-peek";
  const attemptCloseRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!open || !isSidePeek) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isSidePeek]);

  if (!open) return null;

  const panelClass = isSidePeek
    ? "fixed right-0 top-0 z-50 flex h-dvh w-[min(760px,96vw)] flex-col border-l border-border-card bg-bg-card shadow-2xl animate-in slide-in-from-right"
    : "flex h-[80vh] w-[min(1100px,95vw)] flex-col rounded-lg border border-border-card bg-bg-card shadow-xl";

  const attemptClose = () => {
    if (skills.isDirty && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  };
  attemptCloseRef.current = attemptClose;

  const attemptKindSwitch = (next: SkillKind) => {
    if (skills.isDirty && !window.confirm("Discard unsaved changes?")) return;
    setKind(next);
  };

  const scopeLabel = scope.kind === "global" ? "Global" : "Project";

  const panel = (
    <div
      data-testid="skills-preview-root"
      data-preview-mode={settings.previewMode}
      className={panelClass}
    >
        <div className="flex items-center justify-between border-b border-border-card px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="font-mono text-[11px] uppercase tracking-wide text-text-muted">{scopeLabel}</div>
            <div role="tablist" className="flex gap-1">
              <button
                role="tab"
                aria-selected={kind === "skill"}
                onClick={() => attemptKindSwitch("skill")}
                className="rounded-md px-2 py-1 text-[12px] text-text-secondary data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary"
                data-active={kind === "skill"}
              >
                Skills
              </button>
              <button
                role="tab"
                aria-selected={kind === "command"}
                onClick={() => attemptKindSwitch("command")}
                className="rounded-md px-2 py-1 text-[12px] text-text-secondary data-[active=true]:bg-bg-hover data-[active=true]:text-text-primary"
                data-active={kind === "command"}
              >
                Commands
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="rounded-md px-3 py-1 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              + New
            </button>
            <button
              type="button"
              aria-label="close dialog"
              onClick={attemptClose}
              className="rounded-md p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <X width={16} height={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <SkillsList
            items={skills.items}
            kind={kind}
            selectedPath={skills.selected?.path ?? null}
            onSelect={(item) => {
              if (skills.isDirty && !window.confirm("Discard unsaved changes?")) return;
              skills.select(item);
            }}
            query={query}
            onQueryChange={setQuery}
          />
          <div className="flex-1">
            {skills.selected ? (
              <SkillEditor
                item={skills.selected}
                frontmatter={skills.draftFrontmatter}
                onFrontmatterChange={skills.setDraftFrontmatter}
                body={skills.draftBody}
                onBodyChange={skills.setDraftBody}
                isDirty={skills.isDirty}
                onSave={skills.save}
                onRevert={skills.revert}
                onDelete={() => setShowDelete(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
                {skills.loading ? "Loading…" : "Select an item"}
              </div>
            )}
          </div>
        </div>
    </div>
  );

  const nested = (
    <>
      <NewSkillDialog
        open={showNew}
        defaultKind={kind}
        onClose={() => setShowNew(false)}
        onCreate={async (k, name) => {
          await skills.create(k, name);
          setKind(k);
        }}
      />
      <DeleteSkillConfirm
        open={showDelete}
        name={skills.selected?.name ?? ""}
        onCancel={() => setShowDelete(false)}
        onConfirm={async () => {
          if (skills.selected) await skills.remove(skills.selected);
          setShowDelete(false);
        }}
      />
    </>
  );

  if (isSidePeek) {
    return (
      <>
        {panel}
        {nested}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      {panel}
      {nested}
    </div>
  );
}
