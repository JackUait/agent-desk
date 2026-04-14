import type { Model } from "../../shared/types/domain";
import { EFFORTS, type Effort } from "./useModels";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuCheckboxItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
} from "@/components/ui/menu";
import { ChevronDownIcon } from "lucide-react";

export interface ModelSelection {
  model: string;
  effort: Effort;
}

interface ModelChooserProps {
  models: Model[];
  value: ModelSelection;
  onChange: (next: ModelSelection) => void;
  disabled?: boolean;
}

export function ModelChooser({
  models,
  value,
  onChange,
  disabled,
}: ModelChooserProps) {
  const selectedLabel =
    models.find((m) => m.id === value.model)?.label ?? value.model;

  return (
    <Menu>
      <MenuTrigger
        data-testid="model-chooser"
        aria-label="Model"
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-card bg-bg-page px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{selectedLabel}</span>
        <span className="text-text-muted">·</span>
        <span>{value.effort}</span>
        <ChevronDownIcon className="size-4 text-text-muted" />
      </MenuTrigger>
      <MenuContent>
        {models.map((m) => (
          <MenuSub key={m.id}>
            <MenuSubTrigger>{m.label}</MenuSubTrigger>
            <MenuSubContent>
              {EFFORTS.map((e) => (
                <MenuCheckboxItem
                  key={e}
                  checked={m.id === value.model && e === value.effort}
                  onCheckedChange={(checked) => {
                    if (checked) onChange({ model: m.id, effort: e });
                  }}
                >
                  {e}
                </MenuCheckboxItem>
              ))}
            </MenuSubContent>
          </MenuSub>
        ))}
      </MenuContent>
    </Menu>
  );
}
