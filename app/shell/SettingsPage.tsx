// The Settings view: workspace (coming soon), the BYOK OpenAI key panel, and the trash —
// "Recently deleted" is just a filtered view over the same note summaries (deletedAt set),
// with restore (clear the label) and purge (permanent) actions.
import { SettingsKeys } from "../components/SettingsKeys";
import { formatTime } from "../components/AudioPlayer";
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
  onBack,
  onRestore,
  onPurge,
  onEmpty,
  onKeysSaved,
}: {
  trashed: NoteSummary[];
  onBack: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onEmpty: () => void;
  onKeysSaved: () => void;
}) {
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
