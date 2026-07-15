import { useEffect, useState } from "react";
import type { Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "./components/AudioPlayer";
import { DropZone } from "./components/DropZone";
import { SettingsKeys } from "./components/SettingsKeys";
import { EditableTitle } from "./components/EditableTitle";
import { LibraryFeed, formatNoteDate } from "./shell/LibraryFeed";
import { StickyPlayer } from "./shell/StickyPlayer";
import { ReadingPane } from "./shell/ReadingPane";
import { SearchModal } from "./shell/SearchModal";
import { FoldersModal } from "./shell/FoldersModal";
import { TagChips } from "./shell/TagChips";
import { allFolders, rememberFolder } from "./lib/folders";
import { hasKeys } from "./lib/keys";
import { buildConcepts, buildKeyMoments } from "./lib/providers/openaiLlm";
import {
  getNote,
  listNotes,
  renameNote,
  saveNote,
  updateNote,
  type NoteSummary,
} from "./lib/notesDb";
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

  // Older notes were processed before key moments/concepts existed; they can be
  // upgraded from the stored transcript alone (no re-transcription, purely additive).
  const needsUpgrade = !!note?.transcript && (!note.keymoments || !note.concepts);

  async function handleUpgrade() {
    const target = note;
    if (!target?.transcript) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const [keymoments, concepts] = await Promise.all([
        target.keymoments ?? buildKeyMoments(target.transcript),
        target.concepts ?? buildConcepts(target.transcript),
      ]);
      await updateNote(target.id, { keymoments, concepts });
      setNote((prev) =>
        prev && prev.id === target.id ? { ...prev, keymoments, concepts } : prev,
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
      .then((n) => n && setNote(n))
      .catch((e) => setError(String(e)));
  }, [selectedId, resetFocus]);

  function exportNote() {
    if (!note) return;
    const payload = {
      id: note.id,
      title: note.title,
      durationSec: note.durationSec,
      transcript: note.transcript,
      layers: note.layers,
      keymoments: note.keymoments,
      annotations: note.annotations,
      concepts: note.concepts,
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
            ⚙
          </button>
        </div>
        <DropZone onUpload={handleUpload} disabled={!keysReady} />
        <button className="side-search" onClick={() => setSearchOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className="side-search-label">Search notes</span>
          <span className="kbd">⌘K</span>
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
                      {note.pinned ? "★" : "☆"}
                    </button>
                    <button className="ghost-btn" onClick={exportNote} title="Download JSON">
                      Export
                    </button>
                  </div>
                </div>
                <TagChips
                  tags={note.tags ?? []}
                  onChange={(tags) => void patchLabels(note.id, { tags })}
                />

                <StickyPlayer note={note} />

                {needsUpgrade && (
                  <div className="upgrade-banner">
                    <span>
                      This note can be upgraded with the latest analysis (key moments and
                      concepts). Nothing existing is changed.
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

                <ReadingPane note={note} />
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
