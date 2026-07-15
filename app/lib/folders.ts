// The folder name registry. A folder is just a string label on notes; this list only
// exists so a freshly created (still empty) folder survives until a note is dropped in.
// The full folder set = this list ∪ every folder found on the notes.
const KEY = "wvr.folders";

export function storedFolders(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export function rememberFolder(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = storedFolders();
  if (!list.includes(trimmed)) localStorage.setItem(KEY, JSON.stringify([...list, trimmed]));
}

/** Rename a folder in the registry: drop the old label, add the new one (deduped). Notes
 *  that carry the old label are updated separately by the caller. */
export function renameFolder(oldName: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const list = storedFolders().filter((f) => f !== oldName);
  if (!list.includes(trimmed)) list.push(trimmed);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function allFolders(noteFolders: (string | undefined)[]): string[] {
  const set = new Set(storedFolders());
  for (const f of noteFolders) if (f) set.add(f);
  return [...set].sort((a, b) => a.localeCompare(b));
}
