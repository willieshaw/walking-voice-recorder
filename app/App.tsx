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
  const resetFocus = useFocus((s) => s.reset);

  useEffect(() => {
    listNotes().then(setSummaries);
  }, []);

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
        {summaries.length === 0 ? (
          <p className="hint">
            {keysReady
              ? "No notes yet. Drop a recording above to get started."
              : "Add your API keys to begin."}
          </p>
        ) : (
          <>
            <div className="side-label">Recent</div>
            <ul className="note-list">
              {summaries.map((s) => (
                <li key={s.id}>
                  <div
                    className={`note-item${
                      s.id === selectedId && view === "memo" ? " selected" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openMemo(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openMemo(s.id);
                    }}
                  >
                    <EditableTitle
                      as="span"
                      className="note-title"
                      value={s.title}
                      activateOn="dblclick"
                      onSave={(t) => handleRename(s.id, t)}
                    />
                    <span className="note-dur">{formatTime(s.durationSec)}</span>
                  </div>
                </li>
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
          <LibraryFeed summaries={summaries} onOpen={openMemo} />
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
                  <button className="ghost-btn" onClick={exportNote} title="Download JSON">
                    Export
                  </button>
                </div>

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
    </div>
  );
}
