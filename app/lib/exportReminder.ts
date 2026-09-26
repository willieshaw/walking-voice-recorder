// Export reminder for the web→Mac transition: has the user downloaded a backup, and has
// anything changed since? Pure state function + the localStorage stamp it reads.

export type ReminderState =
  | { kind: "never" }
  | { kind: "stale"; lastExportAt: number; changed: number }
  | { kind: "current"; lastExportAt: number };

/** `notes` is every note on the device, trash included — a backup contains them all. */
export function reminderState(
  notes: readonly { updatedAt: number }[],
  lastExportAt: number | null,
): ReminderState {
  if (lastExportAt === null) return { kind: "never" };
  const changed = notes.filter((n) => n.updatedAt > lastExportAt).length;
  return changed > 0 ? { kind: "stale", lastExportAt, changed } : { kind: "current", lastExportAt };
}

const KEY = "wvr.lastExportAt";

export function getLastExportAt(): number | null {
  const raw = localStorage.getItem(KEY);
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}

export function setLastExportAt(at: number): void {
  localStorage.setItem(KEY, String(at));
}
