import { useId } from "react";

interface ProgressBarProps {
  step: number;
  totalSteps: number;
  currentStep: string;
}

export function ProgressBar({ step, totalSteps, currentStep }: ProgressBarProps) {
  const labelId = useId();
  const pct = totalSteps === 0 ? 0 : Math.min(100, Math.round((step / totalSteps) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span id={labelId}>{currentStep}</span>
        <span className="font-mono">
          {step} / {totalSteps}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        className="h-1 w-full rounded-full bg-bg-hover overflow-hidden"
      >
        <div
          data-testid="progress-fill"
          className="h-full bg-accent-blue transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
