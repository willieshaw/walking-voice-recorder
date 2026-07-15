import { useEffect, useRef, useState } from "react";
import type { Annotation, Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "./components/AudioPlayer";
import { DropZone } from "./components/DropZone";
import { SettingsKeys } from "./components/SettingsKeys";
import { EditableTitle } from "./components/EditableTitle";
import { LibraryFeed, formatNoteDate } from "./shell/LibraryFeed";
import { StickyPlayer } from "./shell/StickyPlayer";
import { ReadingPane, type AnnotationPatch } from "./shell/ReadingPane";
import { DigestCard } from "./shell/DigestCard";
import { SearchModal } from "./shell/SearchModal";
import { FoldersModal } from "./shell/FoldersModal";
import { TagChips } from "./shell/TagChips";
import { allFolders, rememberFolder, renameFolder } from "./lib/folders";
import { hasKeys } from "./lib/keys";
import { buildDirectives, buildKeyMoments, buildSummary } from "./lib/providers/openaiLlm";
import {
  addSummaryVariant,
  getNote,
  listNotes,
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
  const [view, setView] = useState<"library" | "memo">("library");
  const [summaries, setSummaries] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysReady, setKeysReady] = useState(hasKeys());
  const [showSettings, setShowSettings] = useState(!hasKeys());
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

  useEffect(() => {
    listNotes().then(setSummaries);
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

  const folders = allFolders(summaries.map((s) => s.folder));
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

  // Older notes were processed before the newer analyses existed; they can be upgraded
  // from the stored transcript alone (no re-transcription, purely additive).
  const needsUpgrade =
    !!note?.transcript &&
    (!note.keymoments || note.summary === undefined || !note.annotations);

  async function handleUpgrade() {
    const target = note;
    if (!target?.transcript) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const [keymoments, noteSummary, annotations] = await Promise.all([
        target.keymoments ?? buildKeyMoments(target.transcript),
        target.summary ?? buildSummary(target.transcript),
        target.annotations ?? buildDirectives(target.transcript),
      ]);
      await updateNote(target.id, { keymoments, summary: noteSummary, annotations });
      setNote((prev) =>
        prev && prev.id === target.id
          ? { ...prev, keymoments, summary: noteSummary, annotations }
          : prev,
      );
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpgrading(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    setNote(null);
    setError(null);
    setUpgradeError(null);
    resetFocus();
    getNote(selectedId)
      .then((n) => {
        if (!n) return;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = n.audioUrl;
        setNote(n);
      })
      .catch((e) => setError(String(e)));
  }, [selectedId, resetFocus]);

  // Free the last note's audio object URL when the app unmounts.
  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  function exportNote() {
    if (!note) return;
    const payload = {
      id: note.id,
      title: note.title,
      durationSec: note.durationSec,
      transcript: note.transcript,
      summary: note.summary,
      layers: note.layers,
      keymoments: note.keymoments,
      annotations: note.annotations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const summary = note && summaries.find((s) => s.id === note.id);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <h1 className="brand" onClick={goLibrary} role="button" tabIndex={0}>
            Thoughts
          </h1>
          <button className="icon-btn" title="API keys" onClick={() => setShowSettings(true)}>
            <svg
              width="19"
              height="19"
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
        {summaries.length === 0 ? (
          <p className="hint">
            {keysReady
              ? "No notes yet. Drop a recording above to get started."
              : "Add your API keys to begin."}
          </p>
        ) : (
          <>
            {summaries.some((s) => s.pinned) && (
              <>
                <div className="side-label">Pinned</div>
                <ul className="note-list note-list-pinned">
                  {summaries
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
              {summaries
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
        <div className="account-row">
          <span className="account-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
            </svg>
          </span>
          <div className="account-meta">
            <div className="account-name">Your Account</div>
            <div className="account-sub">Coming soon</div>
          </div>
          <span className="account-badge">Soon</span>
        </div>
      </aside>

      <main className="main">
        {showSettings ? (
          <SettingsKeys
            onSaved={() => {
              setKeysReady(hasKeys());
              setShowSettings(false);
            }}
          />
        ) : view === "library" ? (
          <LibraryFeed
            summaries={
              filterFolder ? summaries.filter((s) => s.folder === filterFolder) : summaries
            }
            title={filterFolder ?? "All notes"}
            onOpen={openMemo}
          />
        ) : (
          <div className="memo">
            <button className="back-btn" onClick={goLibrary}>
              ← Library
            </button>
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
                  {formatTime(note.durationSec)}
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
                    <span className="tip" data-tip="Coming soon">
                      <button
                        className="ghost-btn"
                        onClick={exportNote}
                        disabled
                        aria-disabled="true"
                      >
                        Export
                      </button>
                    </span>
                  </div>
                </div>
                <TagChips
                  tags={note.tags ?? []}
                  onChange={(tags) => void patchLabels(note.id, { tags })}
                />

                <StickyPlayer note={note} />

                <DigestCard
                  note={note}
                  onToggleTodo={(a) => void patchAnnotation(a, { done: !a.done })}
                  onEnsureSummaryVariant={ensureSummaryVariant}
                />

                {needsUpgrade && (
                  <div className="upgrade-banner">
                    <span>
                      This note can be upgraded with the latest analysis (overview summary,
                      key moments, and extracted to-dos). Nothing existing is changed.
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

                <ReadingPane
                  note={note}
                  onPatchAnnotation={(a, patch) => void patchAnnotation(a, patch)}
                />
              </>
            )}
          </div>
        )}
      </main>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onOpen={openMemo} />}
      {foldersOpen && (
        <FoldersModal
          summaries={summaries}
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
