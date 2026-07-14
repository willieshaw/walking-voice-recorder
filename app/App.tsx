import { useEffect, useMemo, useState } from "react";
import type { Note } from "@core/types";
import { useFocus } from "@core/focus";
import { AudioPlayer, formatTime } from "./components/AudioPlayer";
import { DropZone } from "./components/DropZone";
import { SettingsKeys } from "./components/SettingsKeys";
import { experiences } from "./experiences/registry";
import { artifactsPresent } from "./experiences/types";
import { isEnabled } from "./config/flags";
import { hasKeys } from "./lib/keys";
import { getNote, listNotes, type NoteSummary } from "./lib/notesDb";
import { processInBrowser } from "./lib/processInBrowser";
import { saveNote } from "./lib/notesDb";
import "./app.css";

export default function App() {
  const [summaries, setSummaries] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [activeExpId, setActiveExpId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysReady, setKeysReady] = useState(hasKeys());
  const [showSettings, setShowSettings] = useState(!hasKeys());
  const resetFocus = useFocus((s) => s.reset);

  useEffect(() => {
    listNotes().then((list) => {
      setSummaries(list);
      if (list[0]) setSelectedId(list[0].id);
    });
  }, []);

  async function handleUpload(file: File) {
    const { note: n, audioBlob } = await processInBrowser(file);
    await saveNote(n, audioBlob);
    setSummaries(await listNotes());
    setSelectedId(n.id);
  }

  useEffect(() => {
    if (!selectedId) return;
    setNote(null);
    setError(null);
    resetFocus();
    getNote(selectedId)
      .then((n) => n && setNote(n))
      .catch((e) => setError(String(e)));
  }, [selectedId, resetFocus]);

  const available = useMemo(
    () =>
      note
        ? experiences.filter((e) => isEnabled(e.id) && artifactsPresent(note, e.requires))
        : [],
    [note],
  );

  useEffect(() => {
    if (available.length && !available.some((e) => e.id === activeExpId)) {
      setActiveExpId(available[0].id);
    }
  }, [available, activeExpId]);

  const active = available.find((e) => e.id === activeExpId) ?? null;

  function exportNote() {
    if (!note) return;
    const payload = {
      id: note.id,
      title: note.title,
      durationSec: note.durationSec,
      transcript: note.transcript,
      layers: note.layers,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <h1 className="brand">Thoughts</h1>
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
          <ul className="note-list">
            {summaries.map((s) => (
              <li key={s.id}>
                <button
                  className={`note-item${s.id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="note-title">{s.title}</span>
                  <span className="note-dur">{formatTime(s.durationSec)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="main">
        {showSettings ? (
          <SettingsKeys
            onSaved={() => {
              setKeysReady(hasKeys());
              setShowSettings(false);
            }}
          />
        ) : (
          <>
            {error && <p className="error">{error}</p>}
            {!note && !error && selectedId && <p className="hint">Loading…</p>}
            {note && (
              <>
                <header className="note-header">
                  <div className="note-header-row">
                    <h2>{note.title}</h2>
                    <button className="ghost-btn" onClick={exportNote} title="Download JSON">
                      Export
                    </button>
                  </div>
                  <AudioPlayer src={note.audioUrl} />
                </header>

                <nav className="tabs">
                  {available.map((e) => (
                    <button
                      key={e.id}
                      className={`tab${e.id === activeExpId ? " active" : ""}`}
                      onClick={() => setActiveExpId(e.id)}
                    >
                      {e.title}
                    </button>
                  ))}
                </nav>

                <section className="stage">
                  {active ? (
                    <active.Component note={note} />
                  ) : (
                    <p className="hint">No experience available for this note yet.</p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
