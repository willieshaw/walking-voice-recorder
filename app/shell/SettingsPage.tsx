// The Settings view: workspace (coming soon), the BYOK OpenAI key panel, backup (save/
// restore the whole library as one archive through the macOS dialogs), updates (the running
// version plus a manual "Check now"), and the trash — "Recently deleted" is just a
// filtered view over the same note summaries (deletedAt set), with restore (clear the
// label) and purge (permanent) actions.
import { useState } from "react";
import { SettingsKeys } from "../components/SettingsKeys";
import { formatTime } from "../components/AudioPlayer";
import { TagChips } from "./TagChips";
import { exportLibrary } from "../lib/exportLibrary";
import { importArchive } from "../lib/importArchive";
import { getDictionary, setDictionary } from "../lib/dictionary";
import { TRASH_RETENTION_DAYS, type NoteSummary } from "../lib/notesDb";
import "./settings-page.css";

/** "Essays · Jul 2 · 1:12" — the trash row's meta line. */
function trashMeta(s: NoteSummary): string {
  const date = new Date(s.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return [s.folder, date, formatTime(s.durationSec)].filter(Boolean).join(" · ");
}

/** Whole days of retention remaining before this trashed note is purged. */
function daysLeft(deletedAt: number): number {
  const elapsed = Math.floor((Date.now() - deletedAt) / 86_400_000);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsed);
}

export function SettingsPage({
  trashed,
  noteCount,
  onBack,
  onRestore,
  onPurge,
  onEmpty,
  onKeysSaved,
  onRestored,
  appVersion,
  onCheckForUpdates,
}: {
  trashed: NoteSummary[];
  /** Every note on this device, trash included — what a backup would contain. */
  noteCount: number;
  onBack: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmpty: () => void;
  onKeysSaved: () => void;
  /** Called after an archive restore added notes, so the app can refresh its lists. */
  onRestored: () => void;
  /** The running version, shown in the Updates section. */
  appVersion: string;
  /** Manual update check; resolves a status line for the card, rejects on failure. */
  onCheckForUpdates: () => Promise<string>;
}) {
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<"export" | "restore" | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  // The personal dictionary lives in localStorage; edits apply to future transcriptions.
  const [terms, setTerms] = useState<string[]>(getDictionary);

  function updateTerms(next: string[]) {
    setTerms(next);
    setDictionary(next);
  }

  async function downloadBackup() {
    setBusy("export");
    setBackupStatus(null);
    try {
      const r = await exportLibrary();
      if (r) setBackupStatus(`Saved ${r.count} note${r.count === 1 ? "" : "s"} to ${r.filename}.`);
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restoreFromArchive() {
    setBusy("restore");
    setBackupStatus(null);
    try {
      const r = await importArchive();
      if (r) {
        setBackupStatus(
          `Restored ${r.added} note${r.added === 1 ? "" : "s"}` +
            (r.skipped ? ` · ${r.skipped} already here` : "") +
            ".",
        );
        if (r.added) onRestored();
      }
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sp">
      <button className="back-btn" onClick={onBack}>
        ← Library
      </button>
      <h1 className="sp-title">Settings</h1>

      <div className="sp-card sp-workspace">
        <span className="sp-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" />
          </svg>
        </span>
        <div className="sp-workspace-meta">
          <div className="sp-workspace-name">Your workspace</div>
          <div className="sp-workspace-sub">Sign-in &amp; cloud sync — coming soon</div>
        </div>
        <span className="sp-badge">Soon</span>
      </div>

      <SettingsKeys onSaved={onKeysSaved} />

      <div className="sp-section-head">
        <div>
          <div className="sp-section-label">Dictionary</div>
          <div className="sp-section-count">
            {terms.length} term{terms.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="sp-card sp-dictionary">
        <p className="sp-dictionary-sub">
          Your vocabulary. Applies to new transcriptions only.
        </p>
        <TagChips
          tags={terms}
          onChange={updateTerms}
          addLabel="+ Add term"
          placeholder="name or term"
          preserveCase
        />
      </div>

      <div className="sp-section-head">
        <div>
          <div className="sp-section-label">Backup</div>
          <div className="sp-section-count">
            {noteCount} note{noteCount === 1 ? "" : "s"} on this device
          </div>
        </div>
      </div>
      <div className="sp-card sp-backup">
        <div className="sp-backup-main">
          <div className="sp-backup-title">Download library</div>
          <div className="sp-backup-sub">
            One archive with every recording plus its transcript, analyses, and labels, and your
            dictionary, folders, and projects.
            Notes live only on this Mac — keep a copy somewhere safe. Restoring merges
            by note and never overwrites what's already here.
          </div>
        </div>
        <button
          className="sp-backup-btn sp-backup-primary"
          onClick={() => void downloadBackup()}
          disabled={busy !== null || noteCount === 0}
        >
          {busy === "export" ? "Preparing…" : "Download"}
        </button>
        <button
          className="sp-backup-btn"
          onClick={() => void restoreFromArchive()}
          disabled={busy !== null}
        >
          {busy === "restore" ? "Restoring…" : "Restore…"}
        </button>
      </div>
      {backupStatus && <p className="sp-backup-status">{backupStatus}</p>}

      <div className="sp-section-head">
        <div>
          <div className="sp-section-label">Updates</div>
          <div className="sp-section-count">Thoughts {appVersion}</div>
        </div>
      </div>
      <div className="sp-card sp-backup">
        <div className="sp-backup-main">
          <div className="sp-backup-title">Check for updates</div>
          <div className="sp-backup-sub">
            New builds install in place and restart the app. Thoughts also checks once at launch.
          </div>
        </div>
        <button
          className="sp-backup-btn sp-backup-primary"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            setUpdateStatus(null);
            onCheckForUpdates()
              .then(setUpdateStatus, (e: unknown) =>
                setUpdateStatus(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setChecking(false));
          }}
        >
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>
      {updateStatus && <p className="sp-backup-status">{updateStatus}</p>}

      <div className="sp-section-head">
        <div>
          <div className="sp-section-label">Recently deleted</div>
          <div className="sp-section-count">
            {trashed.length} item{trashed.length === 1 ? "" : "s"}
          </div>
        </div>
        {trashed.length > 0 && (
          <button className="sp-empty-btn" onClick={onEmpty}>
            Empty now
          </button>
        )}
      </div>

      {trashed.length === 0 ? (
        <p className="sp-none">Nothing here — deleted notes appear here for {TRASH_RETENTION_DAYS} days.</p>
      ) : (
        <div className="sp-card sp-trash">
          {trashed.map((s) => (
            <div key={s.id} className="sp-row">
              <span className="sp-thumb">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                </svg>
              </span>
              <div className="sp-row-main">
                <div className="sp-row-title">{s.title}</div>
                <div className="sp-row-meta">{trashMeta(s)}</div>
              </div>
              <span className="sp-days">{daysLeft(s.deletedAt ?? Date.now())} days left</span>
              <button className="sp-restore" onClick={() => onRestore(s.id)}>
                Restore
              </button>
              <button className="sp-purge" title="Delete forever" onClick={() => onPurge(s.id)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="sp-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        Notes are kept for {TRASH_RETENTION_DAYS} days, then permanently deleted.
      </p>
    </div>
  );
}
