// The folder name registry, scoped per project. A folder is just a string label on notes;
// this list exists so a freshly created (still empty) folder survives until a note is
// dropped in — and its array order IS the sidebar's display order (drag to reorder).
// The full folder set = this list ∪ every folder found on the notes.
import { DEFAULT_PROJECT } from "./projects";

const LEGACY_KEY = "wvr.folders"; // pre-projects registry — reads as the Default project's

function keyFor(project: string): string {
  return project === DEFAULT_PROJECT ? LEGACY_KEY : `wvr.folders:${project}`;
}

// Pinned folders: the same label-facet idea as a note's `pinned`, but folders are just
// strings, so the pin set lives beside the folder registry (scoped per project).
function pinKeyFor(project: string): string {
  return project === DEFAULT_PROJECT ? "wvr.pinnedFolders" : `wvr.pinnedFolders:${project}`;
}

// The Pinned section's display order: keys "f:<folder>" and "n:<note id>", interleaved.
// An ordering overlay only — membership stays on the note (`pinned`) / in the pin list.
// Stale keys are ignored on read, so nothing here can break if a note or folder goes away.
function orderKeyFor(project: string): string {
  return project === DEFAULT_PROJECT ? "wvr.pinnedOrder" : `wvr.pinnedOrder:${project}`;
}

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export function pinnedFolders(project: string): string[] {
  return readList(pinKeyFor(project));
}

export function setFolderPinned(name: string, project: string, pinned: boolean): void {
  const list = pinnedFolders(project).filter((f) => f !== name);
  if (pinned) list.push(name);
  localStorage.setItem(pinKeyFor(project), JSON.stringify(list));
}

/** Overwrite the whole pin list (undo/redo restores snapshots wholesale). */
export function setFolderPinsList(names: string[], project: string): void {
  localStorage.setItem(pinKeyFor(project), JSON.stringify(names));
}

export function pinnedOrder(project: string): string[] {
  return readList(orderKeyFor(project));
}

export function setPinnedOrder(keys: string[], project: string): void {
  localStorage.setItem(orderKeyFor(project), JSON.stringify(keys));
}

export function storedFolders(project: string): string[] {
  return readList(keyFor(project));
}

export function rememberFolder(name: string, project: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = storedFolders(project);
  if (!list.includes(trimmed)) {
    localStorage.setItem(keyFor(project), JSON.stringify([...list, trimmed]));
  }
}

/** Overwrite the registry — the array's order is the sidebar's folder order. */
export function setFolderOrder(names: string[], project: string): void {
  localStorage.setItem(keyFor(project), JSON.stringify(names));
}

/** Rename a folder in the registry: drop the old label, add the new one (deduped). Notes
 *  that carry the old label are updated separately by the caller. */
export function renameFolder(oldName: string, newName: string, project: string): void {
  const trimmed = newName.trim();
  if (!trimmed) return;
  // Rename in place so the folder keeps its position in the display order.
  const list = storedFolders(project);
  const at = list.indexOf(oldName);
  const without = list.filter((f) => f !== oldName);
  if (!without.includes(trimmed)) without.splice(Math.max(at, 0), 0, trimmed);
  localStorage.setItem(keyFor(project), JSON.stringify(without));
  // The pin (and its spot in the Pinned order) ride along with the rename.
  if (pinnedFolders(project).includes(oldName)) {
    setFolderPinned(oldName, project, false);
    setFolderPinned(trimmed, project, true);
    setPinnedOrder(
      pinnedOrder(project).map((k) => (k === `f:${oldName}` ? `f:${trimmed}` : k)),
      project,
    );
  }
}

/** Registry order first (drag-to-reorder), then folders found only on notes, A→Z. */
export function allFolders(noteFolders: (string | undefined)[], project: string): string[] {
  const stored = storedFolders(project);
  const seen = new Set(stored);
  const extras: string[] = [];
  for (const f of noteFolders) {
    if (f && !seen.has(f)) {
      seen.add(f);
      extras.push(f);
    }
  }
  extras.sort((a, b) => a.localeCompare(b));
  return [...stored, ...extras];
}

/** Carry a project's folder registry along when the project is renamed (merging into any
 *  registry the new name already has). Folders on notes travel with the notes themselves. */
export function moveFolderRegistry(oldProject: string, newProject: string): void {
  if (keyFor(oldProject) === keyFor(newProject)) return;
  const merged = [...new Set([...storedFolders(newProject), ...storedFolders(oldProject)])];
  localStorage.setItem(keyFor(newProject), JSON.stringify(merged));
  localStorage.removeItem(keyFor(oldProject));
  // Pins and the Pinned order travel with the registry.
  const pins = [...new Set([...pinnedFolders(newProject), ...pinnedFolders(oldProject)])];
  localStorage.setItem(pinKeyFor(newProject), JSON.stringify(pins));
  localStorage.removeItem(pinKeyFor(oldProject));
  const order = [...new Set([...pinnedOrder(newProject), ...pinnedOrder(oldProject)])];
  localStorage.setItem(orderKeyFor(newProject), JSON.stringify(order));
  localStorage.removeItem(orderKeyFor(oldProject));
}
