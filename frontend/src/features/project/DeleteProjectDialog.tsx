import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import type { Project } from "../../shared/types/domain";

interface Props {
  project: Project;
  open: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

export function DeleteProjectDialog({ project, open, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState("");
  const matches = value === project.title;
  const partial = value.length > 0 && !matches;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono lowercase">delete project</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            This removes the project, its cards, and worktrees. Your folder contents are untouched.
            Type <span className="font-mono text-text-primary">{project.title}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm outline-none transition ${
            partial ? "border-destructive" : "border-border-card"
          }`}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches}
            onClick={() => onConfirm(project.id)}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
