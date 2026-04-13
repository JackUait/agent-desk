import type { Model } from "../../shared/types/domain";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ModelChooserProps {
  models: Model[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelChooser({
  models,
  value,
  onChange,
  disabled,
}: ModelChooserProps) {
  const selectedLabel = models.find((m) => m.id === value)?.label ?? value;
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)} disabled={disabled}>
      <SelectTrigger
        data-testid="model-chooser"
        aria-label="Model"
        className="h-9 w-auto min-w-[140px] rounded-md border-border-card bg-bg-page text-sm text-text-primary"
      >
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
