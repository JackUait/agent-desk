import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles, Terminal, X } from "lucide-react";
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
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-testid="skills-preview-root"]')) return;
      if (target.closest("[data-sidepeek-safe]")) return;
      attemptCloseRef.current();
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
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
        <div className="flex items-center justify-between gap-4 border-b border-border-card bg-bg-surface/40 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border-card bg-bg-card px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" />
              {scopeLabel}
            </span>
            <div
              role="tablist"
              className="flex items-center gap-0.5 rounded-md border border-border-card bg-bg-surface/60 p-0.5"
            >
              <button
                role="tab"
                aria-selected={kind === "skill"}
                onClick={() => attemptKindSwitch("skill")}
                data-active={kind === "skill"}
                className="group inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-text-secondary transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
              >
                <Sparkles width={12} height={12} className="opacity-70" />
                Skills
                <span className="font-mono text-[10px] tabular-nums text-text-muted group-data-[active=true]:text-text-secondary">
                  {counts.skill}
                </span>
              </button>
              <button
                role="tab"
                aria-selected={kind === "command"}
                onClick={() => attemptKindSwitch("command")}
                data-active={kind === "command"}
                className="group inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-text-secondary transition data-[active=true]:bg-bg-card data-[active=true]:text-text-primary data-[active=true]:shadow-sm"
              >
                <Terminal width={12} height={12} className="opacity-70" />
                Commands
                <span className="font-mono text-[10px] tabular-nums text-text-muted group-data-[active=true]:text-text-secondary">
                  {counts.command}
                </span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-card bg-bg-card px-2.5 py-1 text-[12px] font-medium text-text-primary shadow-sm transition hover:border-border-strong hover:bg-bg-hover"
            >
              <Plus width={12} height={12} />
              New {kind === "skill" ? "skill" : "command"}
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
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
          Loading
        </div>
      </div>
    );
  }

  const label = kind === "skill" ? "skill" : "command";
  const Icon = kind === "skill" ? Sparkles : Terminal;

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="w-full max-w-[440px]">
          <div className="rounded-xl border border-border-card bg-bg-elevated/60 p-6 shadow-sm">
            <div className="mb-4 inline-flex items-center justify-center rounded-lg border border-border-card bg-bg-card p-2 shadow-sm">
              <Icon width={16} height={16} className="text-text-primary" />
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">
              Create your first {label}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {kind === "skill"
                ? "Skills extend what your agents can do. Define a name, a description, and the instructions the agent should follow."
                : "Commands are reusable prompts you can invoke with a slash. Give it a name and the body to run."}
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-text-primary px-3 py-1.5 text-[12px] font-medium text-bg-page shadow-sm transition hover:opacity-90"
            >
              <Plus width={12} height={12} />
              New {label}
            </button>
            <ul className="mt-5 space-y-1.5 border-t border-border-hairline pt-4 font-mono text-[11px] text-text-muted">
              <li className="flex items-center gap-2">
                <span className="text-text-secondary">01</span>
                Pick a short, descriptive name
              </li>
              <li className="flex items-center gap-2">
                <span className="text-text-secondary">02</span>
                Write a one-line description
              </li>
              <li className="flex items-center gap-2">
                <span className="text-text-secondary">03</span>
                Drop in the markdown body
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="inline-flex items-center justify-center rounded-md border border-border-card bg-bg-surface/60 p-2">
        <Icon width={14} height={14} className="text-text-muted" />
      </div>
      <div className="text-[13px] text-text-secondary">Select a {label} to edit</div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
        {total} {label}
        {total === 1 ? "" : "s"} available
      </div>
    </div>
  );
}
