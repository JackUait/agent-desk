import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles, Terminal, X } from "lucide-react";
import type { SkillKind, SkillScope } from "./types";
import { useSkills } from "./use-skills";
import { SkillsList } from "./SkillsList";
import { SkillEditor } from "./SkillEditor";
import { NewSkillDialog } from "./NewSkillDialog";
import { DeleteSkillConfirm } from "./DeleteSkillConfirm";
import { useSettings } from "../settings";
import {
  requestSidePeek,
  releaseSidePeek,
} from "../../shared/ui/side-peek-coordinator";

const SIDE_PEEK_OWNER_ID = "skills";

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
  const releaseRef = useRef<() => boolean>(() => true);

  const counts = useMemo(() => {
    let skill = 0;
    let command = 0;
    for (const item of skills.items) {
      if (item.kind === "skill") skill++;
      else if (item.kind === "command") command++;
    }
    return { skill, command };
  }, [skills.items]);

  const currentKindTotal = kind === "skill" ? counts.skill : counts.command;

  useEffect(() => {
    if (!open || !isSidePeek) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isSidePeek]);

  useEffect(() => {
    if (!open || !isSidePeek) return;
    requestSidePeek(SIDE_PEEK_OWNER_ID, () => releaseRef.current());
    return () => releaseSidePeek(SIDE_PEEK_OWNER_ID);
  }, [open, isSidePeek]);

  useEffect(() => {
    if (!open || !isSidePeek) return;
    const SAFE_SELECTOR =
      '[data-testid="skills-preview-root"],[data-sidepeek-safe]';
    // mousedown runs before React flushes state updates, so the target is
    // still attached to the panel even for buttons that unmount during their
    // own onClick (Revert, DeleteSkillConfirm actions, NewSkillDialog submit).
    // Without this, the subsequent click bubbles to document with a detached
    // target and `closest()` misclassifies the in-panel interaction as
    // "outside", closing the panel.
    let startedInside = false;
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      startedInside =
        target instanceof Element && !!target.closest(SAFE_SELECTOR);
    };
    const onClick = (event: MouseEvent) => {
      if (startedInside) {
        startedInside = false;
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest(SAFE_SELECTOR)) return;
      attemptCloseRef.current();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick);
    };
  }, [open, isSidePeek]);

  if (!open) return null;

  const panelClass = isSidePeek
    ? "fixed right-0 top-0 z-50 flex h-dvh w-[min(880px,96vw)] flex-col border-l border-border-card bg-bg-card shadow-2xl animate-in slide-in-from-right"
    : "flex h-[82vh] w-[min(1180px,95vw)] flex-col overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-2xl ring-1 ring-black/5";

  const attemptClose = () => {
    if (skills.isDirty && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  };
  attemptCloseRef.current = attemptClose;
  releaseRef.current = () => {
    if (skills.isDirty && !window.confirm("You have unsaved changes. Close anyway?")) {
      return false;
    }
    onClose();
    return true;
  };

  const attemptKindSwitch = (next: SkillKind) => {
    if (next === kind) return;
    if (skills.isDirty && !window.confirm("Discard unsaved changes?")) return;
    setKind(next);
    skills.clearSelection();
  };

  const scopeLabel =
    scope.kind === "global" ? "Global" : scope.projectName ?? "Project";

  const panel = (
    <div
      data-testid="skills-preview-root"
      data-preview-mode={settings.previewMode}
      className={panelClass}
    >
        <div className="flex items-center justify-between gap-4 border-b border-border-hairline px-4 py-2">
          <div className="flex items-center gap-4">
            <span
              className="max-w-[180px] truncate text-[12px] font-medium text-text-secondary"
              title={scopeLabel}
            >
              {scopeLabel}
            </span>
            <div role="tablist" className="flex items-center gap-1">
              <button
                role="tab"
                aria-selected={kind === "skill"}
                onClick={() => attemptKindSwitch("skill")}
                data-active={kind === "skill"}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-text-muted transition hover:text-text-primary data-[active=true]:text-text-primary"
              >
                <Sparkles width={12} height={12} className="opacity-70" />
                Skills
              </button>
              <button
                role="tab"
                aria-selected={kind === "command"}
                onClick={() => attemptKindSwitch("command")}
                data-active={kind === "command"}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-text-muted transition hover:text-text-primary data-[active=true]:text-text-primary"
              >
                <Terminal width={12} height={12} className="opacity-70" />
                Commands
              </button>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              aria-label={`new ${kind}`}
              title={`New ${kind}`}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <Plus width={15} height={15} />
            </button>
            <button
              type="button"
              aria-label="close dialog"
              onClick={attemptClose}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <X width={15} height={15} />
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
          <div className="flex min-w-0 flex-1 bg-bg-card">
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
              <EmptyPane
                loading={skills.loading}
                total={currentKindTotal}
                kind={kind}
                onCreate={() => setShowNew(true)}
              />
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

interface EmptyPaneProps {
  loading: boolean;
  total: number;
  kind: SkillKind;
  onCreate: () => void;
}

function EmptyPane({ loading, total, kind, onCreate }: EmptyPaneProps) {
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-[12px] text-text-muted">Loading…</div>
      </div>
    );
  }

  const label = kind === "skill" ? "skill" : "command";

  if (total === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-[13px] text-text-secondary">No {label}s yet</div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] text-text-muted transition hover:text-text-primary"
        >
          <Plus width={12} height={12} />
          New {label}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-[13px] text-text-muted">Select a {label}</div>
    </div>
  );
}
