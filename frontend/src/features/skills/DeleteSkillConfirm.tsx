interface Props {
  open: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSkillConfirm({ open, name, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-lg bg-bg-card p-4">
        <div className="mb-3 text-[13px] text-text-primary">Delete "{name}"?</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1 text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-3 py-1 text-[12px] text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
