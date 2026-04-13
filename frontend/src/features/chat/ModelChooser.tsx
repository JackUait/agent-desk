import type { Model } from "../../shared/types/domain";
import styles from "./ModelChooser.module.css";

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
  return (
    <select
      data-testid="model-chooser"
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Model"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
