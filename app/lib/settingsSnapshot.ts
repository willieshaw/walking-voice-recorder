// The device settings that ride along in a backup archive: the personal dictionary, the
// project registry, and each project's folder registry (with pins and Pinned order). All of
// these live only in localStorage, so without this a restored library would arrive with
// its notes but none of the user's setup. Restore MERGES: nothing already here is dropped.
import { getDictionary, setDictionary } from "./dictionary";
import {
  pinnedFolders,
  pinnedOrder,
  setFolderOrder,
  setFolderPinsList,
  setPinnedOrder,
  storedFolders,
} from "./folders";
import { DEFAULT_PROJECT, allProjects, rememberProject, storedProjects } from "./projects";

export interface FolderSettings {
  /** The registry, in sidebar order. */
  folders: string[];
  pinned: string[];
  /** "f:<folder>" / "n:<note id>" keys, in Pinned-section order. */
  pinnedOrder: string[];
}

export interface SettingsSnapshot {
  dictionary: string[];
  /** The project registry (empty projects survive here); projects on notes travel with the notes. */
  projects: string[];
  /** Keyed by project name, the Default project included under "Default". */
  folders: Record<string, FolderSettings>;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

/** Current order first, then anything new from `incoming`, no duplicates. */
function union(current: string[], incoming: string[]): string[] {
  const seen = new Set(current);
  const out = [...current];
  for (const s of incoming) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** Read this device's settings. `projectNames` is every project the caller knows about
 *  (registry ∪ notes ∪ Default), so each one's folder registry is captured — including
 *  registries for projects that exist only as note labels. */
export function captureSettings(projectNames: string[]): SettingsSnapshot {
  const folders: Record<string, FolderSettings> = {};
  // Default's registry (the legacy key) is captured even when no note is labeled Default.
  for (const p of union([DEFAULT_PROJECT], projectNames)) {
    folders[p] = {
      folders: storedFolders(p),
      pinned: pinnedFolders(p),
      pinnedOrder: pinnedOrder(p),
    };
  }
  return { dictionary: getDictionary(), projects: storedProjects(), folders };
}

/** Pure merge: everything in `current` stays, in its order; `incoming` adds what's new.
 *  Tolerates a partial or malformed `incoming` (an archive edited by hand). */
export function mergeSettings(current: SettingsSnapshot, incoming: SettingsSnapshot): SettingsSnapshot {
  const folders: Record<string, FolderSettings> = {};
  const names = new Set([...Object.keys(current.folders), ...Object.keys(incoming?.folders ?? {})]);
  for (const p of names) {
    const a = current.folders[p] ?? { folders: [], pinned: [], pinnedOrder: [] };
    const b = (incoming?.folders ?? {})[p] as Partial<FolderSettings> | undefined;
    folders[p] = {
      folders: union(a.folders, strings(b?.folders)),
      pinned: union(a.pinned, strings(b?.pinned)),
      pinnedOrder: union(a.pinnedOrder, strings(b?.pinnedOrder)),
    };
  }
  return {
    dictionary: union(current.dictionary, strings(incoming?.dictionary)),
    projects: union(current.projects, strings(incoming?.projects)),
    folders,
  };
}

/** Merge an archive's settings into this device. */
export function applySettings(incoming: SettingsSnapshot): void {
  const incomingProjects = Object.keys(incoming?.folders ?? {});
  const current = captureSettings(union(allProjects([]), incomingProjects));
  const merged = mergeSettings(current, incoming);
  setDictionary(merged.dictionary);
  for (const p of merged.projects) rememberProject(p);
  for (const [p, f] of Object.entries(merged.folders)) {
    setFolderOrder(f.folders, p);
    setFolderPinsList(f.pinned, p);
    setPinnedOrder(f.pinnedOrder, p);
  }
}
