// The web→Mac transition banner above the library. Three states from reminderState():
// never exported (loud), stale (dated, with a change count), current (one quiet line).
import { useState } from "react";
import { exportLibrary } from "../lib/exportLibrary";
import { getLastExportAt, reminderState } from "../lib/exportReminder";
import { MAC_APP_URL } from "../lib/links";
import type { NoteSummary } from "../lib/notesDb";
import "./export-banner.css";

function fmt(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ExportBanner({ notes }: { notes: NoteSummary[] }) {
  // Re-read the stamp after each export; notes come from the parent and re-render on change.
  const [lastExportAt, setLast] = useState<number | null>(getLastExportAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = reminderState(notes, lastExportAt);
  if (notes.length === 0) return null; // nothing to back up

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await exportLibrary();
      setLast(getLastExportAt());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "current") {
    return (
      <div className="export-banner export-banner-quiet">
        <span>Backed up on {fmt(state.lastExportAt)}.</span>
        <a href={MAC_APP_URL} target="_blank" rel="noreferrer">
          Get the Mac app →
        </a>
      </div>
    );
  }

  const copy =
    state.kind === "never"
      ? "Thoughts is moving to a Mac app. Download your notes so nothing is lost."
      : `Backed up on ${fmt(state.lastExportAt)}. ${state.changed} note${
          state.changed === 1 ? "" : "s"
        } changed since.`;

  return (
    <div className="export-banner">
      <span>{copy}</span>
      <button className="ghost-btn" onClick={() => void download()} disabled={busy || notes.length === 0}>
        {busy ? "Preparing…" : state.kind === "never" ? "Download your notes" : "Download again"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
