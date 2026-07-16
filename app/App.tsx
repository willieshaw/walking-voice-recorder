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
import { isCombined, resolveCombined, type Combined } from "@core/combine";

/** The subset of an annotation a user can mutate (currently just a to-do's done state). */
type AnnotationPatch = Partial<Pick<Annotation, "done">>;
import { SearchModal } from "./shell/SearchModal";
import { FoldersModal } from "./shell/FoldersModal";
import { TagChips } from "./shell/TagChips";
import { allFolders, rememberFolder, renameFolder } from "./lib/folders";
import { hasKeys } from "./lib/keys";
import {
  buildDirectives,
  buildKeyMoments,
  buildLayers,
  buildSummary,
} from "./lib/providers/openaiLlm";
import { CURRENT_ANALYSIS, staleAnalyses } from "@engine/processors/analysis";
import {
  addSummaryVariant,
  getNote,
  listNotes,
  purgeExpired,
  purgeNote,
  renameNote,
  saveNote,
  updateAnnotation,
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
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [filterFolder, setFilterFolder] = useState<string | null>(null);
  const [folderBump, setFolderBump] = useState(0); // re-derive folders after "New folder"
  const resetFocus = useFocus((s) => s.reset);
  // The object URL of the loaded note's audio. getNote mints a fresh one each call, so we
  // revoke the previous when a new note loads (and on unmount) — otherwise every note we
  // open leaks its audio blob into memory until a full reload.
  const audioUrlRef = useRef<string | null>(null);
  // Object URLs minted for a combined note's source clips — revoked when the combination or
  // the open note changes, so stitched playback doesn't leak a blob URL per source.
  const combinedUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    // Drop trashed notes whose 30-day window lapsed, then load the rest.
    purgeExpired().then(listNotes).then(setSummaries);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setFoldersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Soft delete is a label facet: the feed/sidebar are the live view, the Settings
  // trash is the deleted view — both filters over the same summaries, no new subsystem.
  const live = summaries.filter((s) => !s.deletedAt);
  const trashed = summaries.filter((s) => s.deletedAt);

  const folders = allFolders(live.map((s) => s.folder));
  void folderBump;

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
    renameFolder(oldName, trimmed);
    const affected = summaries.filter((s) => s.folder === oldName);
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

  async function handleUpload(file: File) {
    const { note: n, audioBlob } = await processInBrowser(file);
    await saveNote(n, audioBlob);
    setSummaries(await listNotes());
    openMemo(n.id);
  }

  async function handleRename(id: string, title: string) {
    await renameNote(id, title);
    setSummaries((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    setNote((prev) => (prev && prev.id === id ? { ...prev, title } : prev));
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
  // bumping a version resurfaces this banner on every previously-processed note).
  const staleKinds = note?.transcript ? staleAnalyses(note) : [];
  const needsUpgrade = staleKinds.length > 0;

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
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <h1 className="brand" onClick={goLibrary} role="button" tabIndex={0}>
            Thoughts
          </h1>
        </div>
        <DropZone onUpload={handleUpload} disabled={!keysReady} />
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
        <button className="side-folders" onClick={() => setFoldersOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span className="side-folders-label">Folders</span>
          <span className="side-folders-count">{folders.length}</span>
        </button>
        {live.length === 0 ? (
          <p className="hint">
            {keysReady
              ? "No notes yet. Drop a recording above to get started."
              : "Add your API keys to begin."}
          </p>
        ) : (
          <>
            {live.some((s) => s.pinned) && (
              <>
                <div className="side-label">Pinned</div>
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
                      />
                    ))}
                </ul>
              </>
            )}
            <div className="side-label">Recent</div>
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
                  />
                ))}
            </ul>
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

      <main className="main">
        {view === "settings" ? (
          <SettingsPage
            trashed={trashed}
            onBack={goLibrary}
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
                  onCombine={() => setCombineOpen(true)}
                  onMove={(folder) => {
                    if (folder) rememberFolder(folder);
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

                {needsUpgrade && !combined && (
                  <div className="upgrade-banner">
                    <span>
                      This note was analyzed with older prompts. Upgrade re-runs the latest
                      analysis (reading, summary, chapters, to-dos) — your recording and
                      transcript are never touched.
                    </span>
                    <button
                      className="ghost-btn"
                      onClick={handleUpgrade}
                      disabled={upgrading || !keysReady}
                    >
                      {upgrading ? "Upgrading…" : "Upgrade note"}
                    </button>
                    {upgradeError && <span className="error">{upgradeError}</span>}
                  </div>
                )}

                <ReadingPane note={activeNote ?? note} />
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

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onOpen={openMemo} />}
      {foldersOpen && (
        <FoldersModal
          summaries={live}
          folders={folders}
          onClose={() => setFoldersOpen(false)}
          onOpen={openMemo}
          onMove={(id, folder) => void patchLabels(id, { folder })}
          onCreate={(name) => {
            rememberFolder(name);
            setFolderBump((n) => n + 1);
          }}
          onRename={(oldName, newName) => void handleRenameFolder(oldName, newName)}
          onPick={(f) => {
            setFilterFolder(f);
            setView("library");
          }}
        />
      )}
    </div>
  );
}

function SidebarNote({
  summary: s,
  selected,
  onOpen,
  onRename,
}: {
  summary: NoteSummary;
  selected: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  return (
    <li>
      <div
        className={`note-item${selected ? " selected" : ""}`}
        role="button"
        tabIndex={0}
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
      </div>
    </li>
  );
}
