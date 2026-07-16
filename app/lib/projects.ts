// Project spaces ("drives"). A project is one more label facet — `note.project` — with an
// app-level "active project" every surface filters by. This registry (like the folder
// registry) only exists so an empty project survives until a note lands in it; the full
// set = this list ∪ every project found on the notes. "Default" is the fixed baseline:
// notes without a project label live there, so legacy notes need no migration.

const KEY = "wvr.projects";
const ACTIVE = "wvr.activeProject";

export const DEFAULT_PROJECT = "Default";

function storedProjects(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** Every project, Default first, then the registry ∪ note labels, sorted. */
export function allProjects(noteProjects: (string | undefined)[]): string[] {
  const set = new Set(storedProjects());
  for (const p of noteProjects) if (p && p !== DEFAULT_PROJECT) set.add(p);
  set.delete(DEFAULT_PROJECT);
  return [DEFAULT_PROJECT, ...[...set].sort((a, b) => a.localeCompare(b))];
}

export function activeProject(): string {
  return localStorage.getItem(ACTIVE) ?? DEFAULT_PROJECT;
}

export function setActiveProjectStored(p: string): void {
  localStorage.setItem(ACTIVE, p);
}

export function rememberProject(name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed === DEFAULT_PROJECT) return;
  const list = storedProjects();
  if (!list.includes(trimmed)) localStorage.setItem(KEY, JSON.stringify([...list, trimmed]));
}

/** Rename in the registry; notes carrying the old label are updated by the caller. */
export function renameProjectStored(oldName: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed || oldName === DEFAULT_PROJECT) return;
  const list = storedProjects().filter((p) => p !== oldName);
  if (!list.includes(trimmed) && trimmed !== DEFAULT_PROJECT) list.push(trimmed);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeProjectStored(name: string): void {
  localStorage.setItem(KEY, JSON.stringify(storedProjects().filter((p) => p !== name)));
}
