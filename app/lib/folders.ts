// The folder name registry, scoped per project. A folder is just a string label on notes;
// this list only exists so a freshly created (still empty) folder survives until a note is
// dropped in. The full folder set = this list ∪ every folder found on the notes.
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

export function pinnedFolders(project: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pinKeyFor(project)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export function setFolderPinned(name: string, project: string, pinned: boolean): void {
  const list = pinnedFolders(project).filter((f) => f !== name);
  if (pinned) list.push(name);
  localStorage.setItem(pinKeyFor(project), JSON.stringify(list));
}

export function storedFolders(project: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(project)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export function rememberFolder(name: string, project: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = storedFolders(project);
  if (!list.includes(trimmed)) {
    localStorage.setItem(keyFor(project), JSON.stringify([...list, trimmed]));
  }
}

/** Rename a folder in the registry: drop the old label, add the new one (deduped). Notes
 *  that carry the old label are updated separately by the caller. */
export function renameFolder(oldName: string, newName: string, project: string): void {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const list = storedFolders(project).filter((f) => f !== oldName);
  if (!list.includes(trimmed)) list.push(trimmed);
  localStorage.setItem(keyFor(project), JSON.stringify(list));
  // The pin rides along with the rename.
  if (pinnedFolders(project).includes(oldName)) {
    setFolderPinned(oldName, project, false);
    setFolderPinned(trimmed, project, true);
  }
}

export function allFolders(noteFolders: (string | undefined)[], project: string): string[] {
  const set = new Set(storedFolders(project));
  for (const f of noteFolders) if (f) set.add(f);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Carry a project's folder registry along when the project is renamed (merging into any
 *  registry the new name already has). Folders on notes travel with the notes themselves. */
export function moveFolderRegistry(oldProject: string, newProject: string): void {
  if (keyFor(oldProject) === keyFor(newProject)) return;
  const merged = [...new Set([...storedFolders(newProject), ...storedFolders(oldProject)])];
  localStorage.setItem(keyFor(newProject), JSON.stringify(merged));
  localStorage.removeItem(keyFor(oldProject));
  // Pins travel with the registry.
  const pins = [...new Set([...pinnedFolders(newProject), ...pinnedFolders(oldProject)])];
  localStorage.setItem(pinKeyFor(newProject), JSON.stringify(pins));
  localStorage.removeItem(pinKeyFor(oldProject));
}
