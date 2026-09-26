// First run: an empty library offers to import the web app's backup archive. Shown
// instead of the feed until at least one note exists or the user starts fresh.
import { useState } from "react";
import "./onboarding-panel.css";

export function OnboardingPanel({
  onImport,
  onStartFresh,
}: {
  /** Runs the import; resolves null when the picker is cancelled. */
  onImport: () => Promise<{ added: number; skipped: number } | null>;
  onStartFresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await onImport();
      if (r && r.added === 0) setStatus("That archive had no new notes.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob">
      <h1 className="ob-title">Bring your notes from the web version</h1>
      <p className="ob-body">
        In the web app, open the library and click <strong>Download your notes</strong>. Then
        import that file here.
      </p>
      <div className="ob-actions">
        <button className="ob-primary" onClick={() => void run()} disabled={busy}>
          {busy ? "Importing…" : "Import backup…"}
        </button>
        <button className="ob-secondary" onClick={onStartFresh} disabled={busy}>
          Start fresh
        </button>
      </div>
      {/* Always mounted so screen readers announce changes inside the live region. */}
      <p className="ob-status" role="status">
        {status ?? ""}
      </p>
    </div>
  );
}
