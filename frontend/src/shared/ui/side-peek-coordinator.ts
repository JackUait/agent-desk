// Module-level coordinator ensuring at most one side-peek panel is active at a time.
// A new owner asks the current owner to release; the current owner may refuse
// (e.g. user dismissed an unsaved-changes confirm), in which case the new
// owner's request is denied.

export type SidePeekRelease = () => boolean;

let currentOwner: { id: string; release: SidePeekRelease } | null = null;

export function requestSidePeek(id: string, release: SidePeekRelease): boolean {
  if (currentOwner && currentOwner.id === id) {
    currentOwner = { id, release };
    return true;
  }
  if (currentOwner) {
    const released = currentOwner.release();
    if (!released) return false;
    currentOwner = null;
  }
  currentOwner = { id, release };
  return true;
}

export function releaseSidePeek(id: string): void {
  if (currentOwner?.id === id) currentOwner = null;
}

export function __resetSidePeekForTests(): void {
  currentOwner = null;
}
