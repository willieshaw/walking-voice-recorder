import { useEffect, useRef, useState } from "react";
import type { Annotation, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "./components/AudioPlayer";
import { DropZone } from "./components/DropZone";
import { EditableTitle } from "./components/EditableTitle";
import { LibraryFeed, formatNoteDate } from "./shell/LibraryFeed";
import { StickyPlayer } from "./shell/StickyPlayer";
import { ReadingPane } from "./shell/ReadingPane";
import { DigestCard } from "./shell/DigestCard";
import { MemoMenu } from "./shell/MemoMenu";
import { CombineModal } from "./shell/CombineModal";
import { SettingsPage } from "./shell/SettingsPage";
import { KeysModal } from "./shell/KeysModal";
import { isCombined, resolveCombined, type Combined } from "@core/combine";

/** The subset of an annotation a user can mutate (currently just a to-do's done state). */
type AnnotationPatch = Partial<Pick<Annotation, "done">>;

/** One committed paragraph edit on the ⌘Z stack: enough to put the old text back. */
interface EditEntry {
  noteId: string;
  mode: "raw" | "clean";
  chunkId: string;
  text: string;
}
import { SearchModal } from "./shell/SearchModal";
import { FoldersModal } from "./shell/FoldersModal";
import { TagChips } from "./shell/TagChips";
import { ProjectSwitcher } from "./shell/ProjectSwitcher";
import {
  allFolders,
  moveFolderRegistry,
  pinnedFolders,
  rememberFolder,
  renameFolder,
  setFolderPinned,
} from "./lib/folders";
import {
  DEFAULT_PROJECT,
  activeProject as storedActiveProject,
  allProjects,
  rememberProject,
  removeProjectStored,
  renameProjectStored,
  setActiveProjectStored,
} from "./lib/projects";
import { hasKeys } from "./lib/keys";
import {
  buildDirectives,
  buildKeyMoments,
  buildLayers,
  buildSummary,
} from "./lib/providers/openaiLlm";
import { CURRENT_ANALYSIS, staleAnalyses, unseenStaleAnalyses } from "@engine/processors/analysis";
import {
  addSummaryVariant,
  getNote,
  listNotes,
  purgeExpired,
  purgeNote,
  renameNote,
  saveNote,
  updateAnnotation,
  updateChunkText,
  updateNote,
  type NoteSummary,
} from "./lib/notesDb";
import { DEFAULT_VARIANT } from "@engine/processors/summary/prompt";
import { processInBrowser } from "./lib/processInBrowser";
import "./app.css";

export default function App() {
  // First run (no API key yet) lands on Settings, where the key panel lives.
  const [view, setView] = useState<"library" | "memo" | "settings">(
    hasKeys() ? "library" : "settings",
  );
  const [summaries, setSummaries] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  // The resolved combined view (synthetic note + audio segments) when `note` is combined.
  const [combined, setCombined] = useState<Combined | null>(null);
  const [combineOpen, setCombineOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keysReady, setKeysReady] = useState(hasKeys());
  const [keysModalOpen, setKeysModalOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [filterFolder, setFilterFolder] = useState<string | null>(null);
  const [folderBump, setFolderBump] = useState(0); // re-derive folders after "New folder"
  // The active project ("drive"). A project is a label facet on notes; every surface below
  // filters by this. Persisted so reloads land where you left off.
  const [project, setProject] = useState(storedActiveProject());
  const [projectBump, setProjectBump] = useState(0); // re-derive after create/rename/delete
  // Sidebar visibility (the collapse toggle next to the project switcher).
  const [sideCollapsed, setSideCollapsed] = useState(
    () => localStorage.getItem("wvr.sideCollapsed") === "1",
  );
  function toggleSidebar() {
    setSideCollapsed((v) => {
      localStorage.setItem("wvr.sideCollapsed", v ? "0" : "1");
      return !v;
    });
  }
  // Which sidebar dropdowns are expanded — persisted so the sidebar keeps its shape.
  const [openSecs, setOpenSecs] = useState<{ folders: boolean; recent: boolean }>(() => {
    try {
      return {
        folders: true,
        recent: true,
        ...JSON.parse(localStorage.getItem("wvr.sideSections") ?? "{}"),
      };
    } catch {
      return { folders: true, recent: true };
    }
  });
  // Dragging a Recent/Pinned note over a sidebar folder row: which row is the live drop
  // target ("" = the All notes row, meaning "remove from its folder").
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  // The sidebar's "+" spawns an unnamed folder row; it becomes real once named.
  const [namingFolder, setNamingFolder] = useState(false);
  const cancelNaming = useRef(false);
  function commitNewFolder(value: string) {
    setNamingFolder(false);
    if (cancelNaming.current) {
      cancelNaming.current = false;
      return;
    }
    const name = value.trim();
    if (!name) return;
    rememberFolder(name, project);
    setFolderBump((b) => b + 1);
  }
  function toggleSec(k: "folders" | "recent") {
    setOpenSecs((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      localStorage.setItem("wvr.sideSections", JSON.stringify(next));
      return next;
    });
  }
  const resetFocus = useFocus((s) => s.reset);
  // The object URL of the loaded note's audio. getNote mints a fresh one each call, so we
  // revoke the previous when a new note loads (and on unmount) — otherwise every note we
  // open leaks its audio blob into memory until a full reload.
  const audioUrlRef = useRef<string | null>(null);
  // Object URLs minted for a combined note's source clips — revoked when the combination or
  // the open note changes, so stitched playback doesn't leak a blob URL per source.
  const combinedUrlsRef = useRef<string[]>([]);
  // Session-only ⌘Z / ⇧⌘Z history of committed paragraph edits (the durable per-paragraph
  // Revert lives on the chunk itself as `originalText`). Refs so the global key listener
  // registered once always sees the live stacks; noteRef mirrors the open note for the same
  // reason. Entries are tagged by noteId and only apply to the note that's open.
  const undoStack = useRef<EditEntry[]>([]);
  const redoStack = useRef<EditEntry[]>([]);
  const noteRef = useRef<Note | null>(null);
  noteRef.current = note;
  const combinedRef = useRef(false);
  combinedRef.current = !!combined;

  const [notesLoaded, setNotesLoaded] = useState(false);
  useEffect(() => {
    // Drop trashed notes whose 30-day window lapsed, then load the rest.
    purgeExpired()
      .then(listNotes)
      .then((s) => {
        setSummaries(s);
        setNotesLoaded(true);
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        // ⌘Z / ⇧⌘Z: undo/redo committed paragraph edits on the open note. Inside an input
        // or textarea the browser's native undo should win — don't intercept.
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (!noteRef.current || combinedRef.current) return;
        e.preventDefault();
        if (e.shiftKey) void stepHistory(redoStack.current, undoStack.current);
        else void stepHistory(undoStack.current, redoStack.current);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setFoldersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Projects and soft delete are both label facets: first scope everything to the active
  // project, then split live (feed/sidebar) from trashed (Settings) — filtered views over
  // the same summaries, no new subsystem.
  const projects = allProjects(summaries.map((s) => s.project));
  const inProject = summaries.filter((s) => (s.project ?? DEFAULT_PROJECT) === project);
  const live = inProject.filter((s) => !s.deletedAt);
  const trashed = inProject.filter((s) => s.deletedAt);

  const folders = allFolders(live.map((s) => s.folder), project);
  // Pinned folders surface in the sidebar's Pinned section (and leave the Folders list).
  const pinnedF = pinnedFolders(project).filter((f) => folders.includes(f));
  void folderBump;
  void projectBump;

  function toggleFolderPin(f: string) {
    setFolderPinned(f, project, !pinnedFolders(project).includes(f));
    setFolderBump((b) => b + 1);
  }

  /** One sidebar folder row — shared by the Pinned section and the Folders list so both
   *  filter, pin, and accept note drops identically. */
  const folderRow = (f: string) => (
    <SidebarFolder
      key={f}
      name={f}
      count={live.filter((s) => s.folder === f).length}
      active={filterFolder === f && view === "library"}
      dropTarget={dropFolder === f}
      pinned={pinnedF.includes(f)}
      onOpen={() => {
        setFilterFolder(f);
        setView("library");
      }}
      onTogglePin={() => toggleFolderPin(f)}
      onDragOver={(e) => {
        e.preventDefault();
        setDropFolder(f);
      }}
      onDragLeave={() => setDropFolder((v) => (v === f ? null : v))}
      onDrop={(e) => {
        e.preventDefault();
        setDropFolder(null);
        const id = e.dataTransfer.getData("text/wvr-note");
        if (id) void patchLabels(id, { folder: f });
      }}
    />
  );

  // If the stored active project no longer exists (renamed/deleted in another tab or a
  // past session), fall back to the first real project once the notes have loaded.
  useEffect(() => {
    if (notesLoaded && !projects.includes(project)) switchProject(projects[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesLoaded, project, projects.join(" ")]);

  /** Persist label-facet changes (tags/folder/pinned) and mirror them into state. */
  async function patchLabels(
    id: string,
    patch: Partial<Pick<Note, "tags" | "folder" | "pinned">>,
  ) {
    await updateNote(id, patch);
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setNote((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  /** Persist a user mutation on one annotation (e.g. a to-do's done state). Routed through
   *  updateAnnotation so it's a by-id read-modify-write — concurrent toggles don't clobber
   *  each other the way a full-array write built from stale React state would. */
  async function patchAnnotation(a: Annotation, patch: AnnotationPatch) {
    const target = note;
    if (!target) return;
    const annotations = await updateAnnotation(target.id, a.id, patch);
    setNote((prev) => (prev && prev.id === target.id ? { ...prev, annotations } : prev));
  }

  /** Rename a folder everywhere: the registry, every note carrying the old label, and any
   *  active filter. A folder is just a label, so this is a bulk relabel — no new concept. */
  async function handleRenameFolder(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    // Renaming onto an existing folder merges the two — confirm before collapsing them.
    if (
      folders.includes(trimmed) &&
      !window.confirm(`Merge "${oldName}" into the existing folder "${trimmed}"?`)
    ) {
      return;
    }
    renameFolder(oldName, trimmed, project);
    const affected = inProject.filter((s) => s.folder === oldName);
    await Promise.all(affected.map((s) => updateNote(s.id, { folder: trimmed })));
    setSummaries((prev) =>
      prev.map((s) => (s.folder === oldName ? { ...s, folder: trimmed } : s)),
    );
    setNote((prev) => (prev && prev.folder === oldName ? { ...prev, folder: trimmed } : prev));
    if (filterFolder === oldName) setFilterFolder(trimmed);
    setFolderBump((n) => n + 1);
  }

  /** Lazily generate one alternate summary variant and cache it on the note. The default
   *  variant already lives in `note.summary`; others are filled the first time a user
   *  toggles to them. Throws on failure so the card can show a retry. */
  async function ensureSummaryVariant(variantId: string) {
    const target = note;
    if (!target?.transcript) return;
    if (variantId === DEFAULT_VARIANT) return; // the default is note.summary
    if (target.summaries?.[variantId]) return; // already cached
    const text = await buildSummary(target.transcript, variantId);
    const summaries = await addSummaryVariant(target.id, variantId, text);
    setNote((prev) => (prev && prev.id === target.id ? { ...prev, summaries } : prev));
  }

  function openMemo(id: string) {
    setSelectedId(id);
    setView("memo");
  }
  function goLibrary() {
    setView("library");
  }

  /** Switch project spaces: everything resets to that project's library view. */
  function switchProject(p: string) {
    if (p === project) return;
    setProject(p);
    setActiveProjectStored(p);
    setFilterFolder(null);
    setSelectedId(null);
    setNote(null);
    setCombined(null);
    setView("library");
  }

  function createProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    rememberProject(trimmed);
    setProjectBump((n) => n + 1);
    switchProject(trimmed);
  }

  /** Rename a project — any project, Default included: the registry, the project's folder
   *  registry, and a bulk relabel of its notes (a project is just a label). */
  async function renameProject(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (
      projects.includes(trimmed) &&
      !window.confirm(`Merge "${oldName}" into the existing project "${trimmed}"?`)
    ) {
      return;
    }
    renameProjectStored(oldName, trimmed);
    moveFolderRegistry(oldName, trimmed);
    // Renaming Default also captures the unlabeled legacy notes it hosts.
    const affected = summaries.filter((s) => (s.project ?? DEFAULT_PROJECT) === oldName);
    await Promise.all(affected.map((s) => updateNote(s.id, { project: trimmed })));
    setSummaries((prev) =>
      prev.map((s) =>
        (s.project ?? DEFAULT_PROJECT) === oldName ? { ...s, project: trimmed } : s,
      ),
    );
    setProjectBump((n) => n + 1);
    if (project === oldName) {
      setProject(trimmed);
      setActiveProjectStored(trimmed);
    }
  }

  /** Delete a project space: its notes move to the first remaining project (nothing is
   *  lost). The last project can't be deleted — the switcher greys its trash out too. */
  async function deleteProject(name: string) {
    if (projects.length < 2) return;
    const dest = projects.find((p) => p !== name);
    if (!dest) return;
    const count = summaries.filter((s) => (s.project ?? DEFAULT_PROJECT) === name).length;
    const detail = count ? ` Its ${count} note${count === 1 ? "" : "s"} will move to ${dest}.` : "";
    if (!window.confirm(`Delete the project "${name}"?${detail}`)) return;
    removeProjectStored(name);
    const newLabel = dest === DEFAULT_PROJECT ? undefined : dest;
    const affected = summaries.filter((s) => (s.project ?? DEFAULT_PROJECT) === name);
    await Promise.all(affected.map((s) => updateNote(s.id, { project: newLabel })));
    setSummaries((prev) =>
      prev.map((s) =>
        (s.project ?? DEFAULT_PROJECT) === name ? { ...s, project: newLabel } : s,
      ),
    );
    setProjectBump((n) => n + 1);
    if (project === name) switchProject(dest);
  }

  async function handleUpload(file: File) {
    const { note: n, audioBlob } = await processInBrowser(file);
    // New notes are stamped with the active project explicitly, so projects survive
    // Default being renamed out from under unlabeled notes.
    n.project = project;
    await saveNote(n, audioBlob);
    setSummaries(await listNotes());
    openMemo(n.id);
  }

  async function handleRename(id: string, title: string) {
    await renameNote(id, title);
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    setNote((prev) => (prev && prev.id === id ? { ...prev, title } : prev));
  }

  /** A chunk's current text on the loaded note — history bookkeeping for undo/redo. */
  function chunkTextOf(n: Note, mode: "raw" | "clean", chunkId: string): string | undefined {
    const list =
      mode === "raw"
        ? n.transcript?.paragraphs
        : n.layers?.levels.find((l) => l.level === 1)?.chunks;
    return list?.find((c) => c.id === chunkId)?.text;
  }

  /** Write one paragraph's text and mirror it into state (shared by edit, undo, redo). */
  async function applyEdit(target: Note, mode: "raw" | "clean", chunkId: string, text: string) {
    const patch = await updateChunkText(target.id, mode, chunkId, text);
    setNote((prev) => (prev && prev.id === target.id ? { ...prev, ...patch } : prev));
    if (patch.transcript) setSummaries(await listNotes()); // feed snippet may have changed
  }

  /** Commit one corrected paragraph (M5.1). Text-only — timestamps/ids survive, and by
   *  decision the analyses are left alone (⋯ Re-analyze is always available). Every commit
   *  (including per-paragraph Revert) lands on the ⌘Z stack. */
  async function handleEditChunk(mode: "raw" | "clean", chunkId: string, text: string) {
    const target = note;
    if (!target) return;
    const prev = chunkTextOf(target, mode, chunkId);
    if (prev === undefined || prev === text) return;
    undoStack.current.push({ noteId: target.id, mode, chunkId, text: prev });
    redoStack.current = [];
    await applyEdit(target, mode, chunkId, text);
  }

  /** Pop the most recent edit for the OPEN note off `from`, stash the inverse on `to`,
   *  and re-apply the stored text. Powers both ⌘Z (undo) and ⇧⌘Z (redo). */
  async function stepHistory(from: EditEntry[], to: EditEntry[]) {
    const target = noteRef.current;
    if (!target) return;
    const i = from.map((e) => e.noteId).lastIndexOf(target.id);
    if (i < 0) return;
    const [entry] = from.splice(i, 1);
    const current = chunkTextOf(target, entry.mode, entry.chunkId);
    if (current !== undefined) to.push({ ...entry, text: current });
    await applyEdit(target, entry.mode, entry.chunkId, entry.text);
  }

  /** Soft delete: stamp `deletedAt` so the note moves to Settings › Recently deleted.
   *  Reversible for 30 days, so no confirm here — the destructive step is the purge. */
  async function handleDelete(id: string) {
    const deletedAt = Date.now();
    await updateNote(id, { deletedAt });
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, deletedAt } : s)));
    if (selectedId === id) {
      setSelectedId(null);
      setNote(null);
      setView("library");
    }
  }

  async function handleRestore(id: string) {
    await updateNote(id, { deletedAt: undefined });
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, deletedAt: undefined } : s)));
  }

  /** Permanent delete of one trashed note (audio included). */
  async function handlePurge(id: string) {
    const target = trashed.find((t) => t.id === id);
    if (!window.confirm(`Permanently delete “${target?.title ?? "this note"}”? This can’t be undone.`)) return;
    await purgeNote(id);
    setSummaries((prev) => prev.filter((s) => s.id !== id));
  }

  /** Permanent delete of everything in the trash. */
  async function handleEmptyTrash() {
    const n = trashed.length;
    if (!window.confirm(`Permanently delete ${n} note${n === 1 ? "" : "s"}? This can’t be undone.`)) return;
    await Promise.all(trashed.map((t) => purgeNote(t.id)));
    setSummaries((prev) => prev.filter((s) => !s.deletedAt));
  }

  // A note needs an upgrade when any analysis is missing OR was built with an older prompt
  // (each processor's `version` is stamped onto the note at build time and compared here —
  // bumping a version resurfaces the offer on every previously-processed note).
  // `needsUpgrade` drives the ⋯ menu's Re-analyze (always listed, greyed when current);
  // the banner additionally honors the user's dismissal, but stays up while upgrading so a
  // menu-triggered re-analysis has visible progress.
  const staleKinds = note?.transcript ? staleAnalyses(note) : [];
  const needsUpgrade = staleKinds.length > 0;
  const showUpgradeBanner =
    (note?.transcript && unseenStaleAnalyses(note).length > 0) || upgrading || !!upgradeError;

  /** Close the upgrade banner: remember the versions it was offering, so it only returns
   *  when a future prompt bump moves past them. */
  async function dismissUpgrade() {
    const target = note;
    if (!target) return;
    const upgradeDismissed = { ...CURRENT_ANALYSIS };
    setUpgradeError(null);
    await updateNote(target.id, { upgradeDismissed });
    setNote((prev) => (prev && prev.id === target.id ? { ...prev, upgradeDismissed } : prev));
  }

  async function handleUpgrade() {
    const target = note;
    if (!target?.transcript) return;
    const stale = staleAnalyses(target);
    if (!stale.length) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      // Rebuild ONLY the stale analyses; fresh ones are kept as-is (no wasted calls).
      const t = target.transcript;
      const [layers, keymoments, noteSummary, rebuiltTodos] = await Promise.all([
        stale.includes("layers") ? buildLayers(t) : target.layers,
        stale.includes("keymoments") ? buildKeyMoments(t) : target.keymoments,
        stale.includes("summary") ? buildSummary(t) : target.summary,
        stale.includes("directives") ? buildDirectives(t) : target.annotations,
      ]);
      // Re-extracted to-dos keep any checked-off state from the old list (matched by label).
      const doneLabels = new Set(
        (target.annotations ?? []).filter((a) => a.kind === "todo" && a.done).map((a) => a.label),
      );
      const annotations = (rebuiltTodos ?? []).map((a) =>
        a.kind === "todo" && doneLabels.has(a.label) ? { ...a, done: true } : a,
      );
      const patch: Partial<Note> = {
        layers,
        keymoments,
        summary: noteSummary,
        annotations,
        artifactVersions: { ...target.artifactVersions, ...CURRENT_ANALYSIS },
        // A new summary prompt invalidates the cached alternate variants too.
        ...(stale.includes("summary") ? { summaries: undefined } : {}),
      };
      await updateNote(target.id, patch);
      setNote((prev) => (prev && prev.id === target.id ? { ...prev, ...patch } : prev));
      // The feed preview derives from the summary — refresh it if we rebuilt one.
      if (stale.includes("summary")) setSummaries(await listNotes());
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpgrading(false);
    }
  }

  /** Resolve (or clear) the combined view for a host note: load its source clips, revoke any
   *  from a prior combination, and build the synthetic combined note. Shared by the note-load
   *  effect and by saving/removing a combination (which don't change `selectedId`). */
  async function loadCombined(host: Note, isCancelled?: () => boolean) {
    combinedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    combinedUrlsRef.current = [];
    if (!isCombined(host)) {
      setCombined(null);
      return;
    }
    const loaded = await Promise.all((host.combinedFrom ?? []).map((id) => getNote(id)));
    if (isCancelled?.()) {
      loaded.forEach((n) => n && URL.revokeObjectURL(n.audioUrl));
      return;
    }
    const sources = loaded.filter((n): n is Note => !!n);
    combinedUrlsRef.current = sources.map((s) => s.audioUrl);
    setCombined(resolveCombined(host, sources));
  }

  useEffect(() => {
    if (!selectedId) return;
    setNote(null);
    setCombined(null);
    setError(null);
    setUpgradeError(null);
    resetFocus();
    let cancelled = false;
    getNote(selectedId)
      .then(async (n) => {
        if (!n || cancelled) return;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = n.audioUrl;
        setNote(n);
        await loadCombined(n, () => cancelled);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, resetFocus]);

  /** Save (or clear, when fewer than 2) a combination and re-resolve it in place — the open
   *  note doesn't change, so we rebuild the combined view directly rather than via reload. */
  async function applyCombination(order: string[]) {
    if (!note) return;
    const value = order.length >= 2 ? order : undefined;
    await updateNote(note.id, { combinedFrom: value });
    const host = { ...note, combinedFrom: value };
    setCombineOpen(false);
    resetFocus();
    setNote(host);
    await loadCombined(host);
  }

  // Free the open note's audio URL, plus any combined-source URLs, when the app unmounts.
  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      combinedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const summary = note && summaries.find((s) => s.id === note.id);
  // The note fed to the player / reading pane / digest: the synthetic combined view when this
  // note is combined, otherwise the note itself. The header/menu/labels always use the host.
  const activeNote = note ? (combined?.note ?? note) : null;

  return (
    <div className={`app${sideCollapsed ? " app-side-collapsed" : ""}`}>
      {sideCollapsed ? (
        // Collapsed: a slim icon rail — the page stays visible beside it.
        <aside className="sidebar sidebar-rail">
          <button className="rail-btn" title="Expand sidebar" onClick={toggleSidebar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9.5 4v16" />
            </svg>
          </button>
          <DropZone
            onUpload={handleUpload}
            disabled={!keysReady}
            compact
            onNeedKeys={() => setKeysModalOpen(true)}
          />
          <button
            className="rail-btn rail-btn-search"
            title="Search notes (⌘K)"
            onClick={() => setSearchOpen(true)}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          <button className="rail-btn" title="Folders" onClick={() => setFoldersOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </button>
          <button
            className="rail-btn rail-btn-bottom"
            title="Settings"
            onClick={() => setView("settings")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </aside>
      ) : (
      <aside className="sidebar">
        <div className="brand-row">
          <ProjectSwitcher
            projects={projects}
            active={project}
            onSwitch={switchProject}
            onCreate={createProject}
            onRename={(o, n) => void renameProject(o, n)}
            onDelete={(p) => void deleteProject(p)}
          />
          <button
            className="icon-btn side-toggle"
            title="Collapse sidebar"
            onClick={toggleSidebar}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9.5 4v16" />
            </svg>
          </button>
        </div>
        <DropZone
          onUpload={handleUpload}
          disabled={!keysReady}
          onNeedKeys={() => setKeysModalOpen(true)}
        />
        <button className="side-search" onClick={() => setSearchOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className="side-search-label">Search notes</span>
          <span className="kbd">
            <span className="kbd-cmd">⌘</span>K
          </span>
        </button>
        {(pinnedF.length > 0 || live.some((s) => s.pinned)) && (
          <>
            <div className="side-sec-head side-sec-static">Pinned</div>
            {pinnedF.length > 0 && <div className="side-folder-list">{pinnedF.map(folderRow)}</div>}
            {live.some((s) => s.pinned) && (
              <ul className="note-list note-list-pinned">
                {live
                  .filter((s) => s.pinned)
                  .map((s) => (
                    <SidebarNote
                      key={s.id}
                      summary={s}
                      selected={s.id === selectedId && view === "memo"}
                      onOpen={openMemo}
                      onRename={handleRename}
                      onTogglePin={() => void patchLabels(s.id, { pinned: !s.pinned })}
                    />
                  ))}
              </ul>
            )}
          </>
        )}
        <div className="side-sec-row">
          <button className="side-sec-head" onClick={() => toggleSec("folders")}>
            Folders
            <span className={`side-caret${openSecs.folders ? " side-caret-open" : ""}`}>›</span>
          </button>
          <button
            className="icon-btn side-sec-action"
            title="Manage folders"
            onClick={() => setFoldersOpen(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          <button
            className="icon-btn side-sec-action"
            title="New folder"
            onClick={() => {
              if (!openSecs.folders) toggleSec("folders");
              cancelNaming.current = false; // fresh naming session
              setNamingFolder(true);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {openSecs.folders && (
          <div className="side-folder-list">
            <a
              className={`side-folder${
                filterFolder === null && view === "library" ? " side-folder-active" : ""
              }${dropFolder === "" ? " side-folder-drop" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                setFilterFolder(null);
                setView("library");
              }}
              onDragOver={(e) => {
                e.preventDefault(); // dropping on All notes clears the note's folder
                setDropFolder("");
              }}
              onDragLeave={() => setDropFolder((v) => (v === "" ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setDropFolder(null);
                const id = e.dataTransfer.getData("text/wvr-note");
                if (id) void patchLabels(id, { folder: undefined });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="side-folder-name">All notes</span>
              <span className="side-folder-count">{live.length}</span>
            </a>
            {namingFolder && (
              <div className="side-folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <input
                  className="side-folder-input"
                  autoFocus
                  placeholder="Folder name"
                  onBlur={(e) => commitNewFolder(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    // Commit directly — not via blur() — so Enter works even if focus
                    // was lost along the way; the blur that follows dedupes to a no-op.
                    if (e.key === "Enter") commitNewFolder(e.currentTarget.value);
                    else if (e.key === "Escape") {
                      cancelNaming.current = true; // the pending blur must not commit
                      setNamingFolder(false);
                    }
                  }}
                />
              </div>
            )}
            {folders.filter((f) => !pinnedF.includes(f)).map(folderRow)}
          </div>
        )}
        {live.length === 0 ? (
          <p className="hint">
            {keysReady
              ? "No notes yet. Drop a recording above to get started."
              : "Add your API keys to begin."}
          </p>
        ) : (
          <>
            <button className="side-sec-head" onClick={() => toggleSec("recent")}>
              Recent
              <span className={`side-caret${openSecs.recent ? " side-caret-open" : ""}`}>›</span>
            </button>
            {openSecs.recent && (
              <ul className="note-list">
                {live
                  .filter((s) => !s.pinned)
                  .map((s) => (
                    <SidebarNote
                      key={s.id}
                      summary={s}
                      selected={s.id === selectedId && view === "memo"}
                      onOpen={openMemo}
                      onRename={handleRename}
                      onTogglePin={() => void patchLabels(s.id, { pinned: !s.pinned })}
                    />
                  ))}
              </ul>
            )}
          </>
        )}
        <button className="account-row" onClick={() => setView("settings")}>
          <span className="account-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
            </svg>
          </span>
          <div className="account-meta">
            <div className="account-name">Settings</div>
            <div className="account-sub">Account &amp; preferences</div>
          </div>
          <svg
            className="account-gear"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </aside>
      )}

      <main className="main">
        {view === "settings" ? (
          <SettingsPage
            trashed={trashed}
            noteCount={summaries.length}
            onBack={goLibrary}
            onRestored={() => void listNotes().then(setSummaries)}
            onRestore={(id) => void handleRestore(id)}
            onPurge={(id) => void handlePurge(id)}
            onEmpty={() => void handleEmptyTrash()}
            onKeysSaved={() => {
              setKeysReady(hasKeys());
              setView("library");
            }}
          />
        ) : view === "library" ? (
          <LibraryFeed
            summaries={filterFolder ? live.filter((s) => s.folder === filterFolder) : live}
            title={filterFolder ?? "All notes"}
            onOpen={openMemo}
          />
        ) : (
          <div className="memo">
            <div className="memo-top">
              <button className="back-btn" onClick={goLibrary}>
                ← Library
              </button>
              {note && (
                <MemoMenu
                  folders={folders}
                  currentFolder={note.folder}
                  combined={isCombined(note)}
                  canReanalyze={needsUpgrade && !upgrading && keysReady}
                  onReanalyze={() => void handleUpgrade()}
                  onCombine={() => setCombineOpen(true)}
                  onMove={(folder) => {
                    if (folder) rememberFolder(folder, project);
                    void patchLabels(note.id, { folder });
                  }}
                  onDelete={() => void handleDelete(note.id)}
                />
              )}
            </div>
            {error && <p className="error">{error}</p>}
            {!note && !error && selectedId && <p className="hint">Loading…</p>}
            {note && (
              <>
                <div className="memo-meta">
                  {note.folder && (
                    <>
                      {note.folder}
                      <span className="memo-dot" />
                    </>
                  )}
                  {summary ? formatNoteDate(summary.createdAt) : ""}
                  <span className="memo-dot" />
                  {formatTime(activeNote?.durationSec ?? note.durationSec)}
                </div>
                <div className="memo-title-row">
                  <EditableTitle
                    as="h2"
                    className="memo-title"
                    value={note.title}
                    activateOn="click"
                    onSave={(t) => handleRename(note.id, t)}
                  />
                  <div className="memo-actions">
                    <button
                      className={`icon-btn pin-btn${note.pinned ? " pin-on" : ""}`}
                      title={note.pinned ? "Unpin" : "Pin to sidebar"}
                      onClick={() => void patchLabels(note.id, { pinned: !note.pinned })}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={note.pinned ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 17v5" />
                        <path d="M9 10.8V4h6v6.8l2 3.2H7l2-3.2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <TagChips
                  tags={note.tags ?? []}
                  onChange={(tags) => void patchLabels(note.id, { tags })}
                />

                <StickyPlayer note={activeNote ?? note} segments={combined?.segments} />

                {combined && (
                  <div className="memo-combined">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span>
                      Combined from <strong>{combined.segments.length}</strong> notes
                    </span>
                    <button className="memo-combined-edit" onClick={() => setCombineOpen(true)}>
                      Edit
                    </button>
                  </div>
                )}

                <DigestCard
                  note={activeNote ?? note}
                  combined={!!combined}
                  onToggleTodo={(a) => void patchAnnotation(a, { done: !a.done })}
                  onEnsureSummaryVariant={ensureSummaryVariant}
                />

                {showUpgradeBanner && !combined && (
                  <div className="upgrade-banner">
                    <span>
                      This note was analyzed with older prompts. Upgrade re-runs the latest
                      analysis (reading, summary, chapters, to-dos) — your recording and
                      transcript are never touched.
                    </span>
                    <button
                      className="ghost-btn"
                      onClick={handleUpgrade}
                      disabled={upgrading || !keysReady || !needsUpgrade}
                    >
                      {upgrading ? "Upgrading…" : "Upgrade note"}
                    </button>
                    {upgradeError && <span className="error">{upgradeError}</span>}
                    <button
                      className="upgrade-close"
                      title="Dismiss (Re-analyze stays in the ⋯ menu)"
                      onClick={() => void dismissUpgrade()}
                      disabled={upgrading}
                    >
                      ×
                    </button>
                  </div>
                )}

                <ReadingPane
                  note={activeNote ?? note}
                  // Combined view is read-only: its paragraphs are composed copies — edit
                  // the source note itself.
                  onEdit={combined ? undefined : (m, id, text) => void handleEditChunk(m, id, text)}
                />
              </>
            )}
          </div>
        )}
      </main>

      {combineOpen && note && (
        <CombineModal
          hostId={note.id}
          summaries={live}
          initial={note.combinedFrom ?? []}
          onClose={() => setCombineOpen(false)}
          onDone={(order) => void applyCombination(order)}
          onRemove={() => void applyCombination([])}
        />
      )}

      {searchOpen && (
        <SearchModal project={project} onClose={() => setSearchOpen(false)} onOpen={openMemo} />
      )}
      {foldersOpen && (
        <FoldersModal
          summaries={live}
          folders={folders}
          onClose={() => setFoldersOpen(false)}
          onOpen={openMemo}
          onMove={(id, folder) => void patchLabels(id, { folder })}
          onCreate={(name) => {
            rememberFolder(name, project);
            setFolderBump((n) => n + 1);
          }}
          onRename={(oldName, newName) => void handleRenameFolder(oldName, newName)}
          onPick={(f) => {
            setFilterFolder(f);
            setView("library");
          }}
        />
      )}
      {keysModalOpen && (
        <KeysModal
          onSaved={() => {
            setKeysReady(hasKeys());
            setKeysModalOpen(false);
          }}
          onViewSettings={() => {
            setKeysModalOpen(false);
            setView("settings");
          }}
          onClose={() => setKeysModalOpen(false)}
        />
      )}
    </div>
  );
}

/** The shared pin glyph (filled when pinned) — same mark the memo header uses. */
function PinIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M9 10.8V4h6v6.8l2 3.2H7l2-3.2z" />
    </svg>
  );
}

function SidebarNote({
  summary: s,
  selected,
  onOpen,
  onRename,
  onTogglePin,
}: {
  summary: NoteSummary;
  selected: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: () => void;
}) {
  return (
    <li>
      <div
        className={`note-item${selected ? " selected" : ""}`}
        role="button"
        tabIndex={0}
        // Draggable onto a sidebar folder row (or All notes, to unfile it).
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/wvr-note", s.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onOpen(s.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpen(s.id);
        }}
      >
        <EditableTitle
          as="span"
          className="note-title"
          value={s.title}
          activateOn="dblclick"
          onSave={(t) => onRename(s.id, t)}
        />
        <span className="note-dur">{formatTime(s.durationSec)}</span>
        <button
          className="row-pin"
          title={s.pinned ? "Unpin" : "Pin to sidebar"}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
        >
          <PinIcon on={s.pinned} />
        </button>
      </div>
    </li>
  );
}

function SidebarFolder({
  name,
  count,
  active,
  dropTarget,
  pinned,
  onOpen,
  onTogglePin,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  name: string;
  count: number;
  active: boolean;
  dropTarget: boolean;
  pinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDragOver: React.DragEventHandler<HTMLAnchorElement>;
  onDragLeave: React.DragEventHandler<HTMLAnchorElement>;
  onDrop: React.DragEventHandler<HTMLAnchorElement>;
}) {
  return (
    <a
      className={`side-folder${active ? " side-folder-active" : ""}${
        dropTarget ? " side-folder-drop" : ""
      }`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      <span className="side-folder-name">{name}</span>
      <span className="side-folder-count">{count}</span>
      <button
        className="row-pin"
        title={pinned ? "Unpin" : "Pin to sidebar"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
      >
        <PinIcon on={pinned} />
      </button>
    </a>
  );
}
