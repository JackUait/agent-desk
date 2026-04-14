interface BlockedBannerProps {
  reason: string;
}

export function BlockedBanner({ reason }: BlockedBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        <span className="font-medium">Blocked:</span> {reason}
      </span>
    </div>
  );
}
