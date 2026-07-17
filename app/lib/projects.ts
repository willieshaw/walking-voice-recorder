// Project spaces ("drives"). A project is one more label facet — `note.project` — with an
// app-level "active project" every surface filters by. This registry (like the folder
// registry) only exists so an empty project survives until a note lands in it; the full
// set = this list ∪ every project found on the notes. "Default" is not fixed — it can be
// renamed or deleted like any project — but while it exists it hosts the unlabeled notes
// (project absent = Default), so legacy notes need no migration.

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

/** Every project: the registry ∪ note labels, plus Default while unlabeled notes exist.
 *  There is always at least one project. Default sorts first when present. */
export function allProjects(noteProjects: (string | undefined)[]): string[] {
  const set = new Set(storedProjects());
  let hasUnlabeled = false;
  for (const p of noteProjects) {
    if (p) set.add(p);
    else hasUnlabeled = true;
  }
  if (hasUnlabeled || set.size === 0) set.add(DEFAULT_PROJECT);
  const rest = [...set].filter((p) => p !== DEFAULT_PROJECT).sort((a, b) => a.localeCompare(b));
  return set.has(DEFAULT_PROJECT) ? [DEFAULT_PROJECT, ...rest] : rest;
}

export function activeProject(): string {
  return localStorage.getItem(ACTIVE) ?? DEFAULT_PROJECT;
}

export function setActiveProjectStored(p: string): void {
  localStorage.setItem(ACTIVE, p);
}

export function rememberProject(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = storedProjects();
  if (!list.includes(trimmed)) localStorage.setItem(KEY, JSON.stringify([...list, trimmed]));
}

/** Rename in the registry; notes carrying the old label are updated by the caller. The new
 *  name is always registered so the project survives even while it has no notes. */
export function renameProjectStored(oldName: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const list = storedProjects().filter((p) => p !== oldName);
  if (!list.includes(trimmed)) list.push(trimmed);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeProjectStored(name: string): void {
  localStorage.setItem(KEY, JSON.stringify(storedProjects().filter((p) => p !== name)));
}
