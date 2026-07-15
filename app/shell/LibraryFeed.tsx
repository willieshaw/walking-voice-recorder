// The library home: every note as a rich feed row (date, serif title, snippet, a small
// decorative waveform, duration). Clicking a row opens the memo view.
import type { NoteSummary } from "../lib/notesDb";
import { formatTime } from "../components/AudioPlayer";
import "./library-feed.css";

/** "Today · 9:14", "Yesterday · 18:40", "Mon · 8:03", or "Jun 3". */
export function formatNoteDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  if (dayDiff < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} · ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Decorative deterministic mini-waveform (seeded by note id — not real audio peaks). */
function MiniWave({ seed }: { seed: string }) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  const bars: number[] = [];
  for (let i = 0; i < 36; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    bars.push(0.22 + (x / 0x7fffffff) * 0.78);
  }
  return (
    <div className="lf-wave" aria-hidden>
      {bars.map((v, i) => (
        <span key={i} style={{ height: `${Math.round(v * 20)}px` }} />
      ))}
    </div>
  );
}

export function LibraryFeed({
  summaries,
  title = "All notes",
  onOpen,
}: {
  summaries: NoteSummary[];
  title?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="lf-page">
      <div className="lf-head">
        <h1 className="lf-title">{title}</h1>
        <span className="lf-count">
          {summaries.length} note{summaries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="lf-rule" />
      {summaries.map((s) => (
        <a
          key={s.id}
          className="lf-row"
          role="button"
          tabIndex={0}
          onClick={() => onOpen(s.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onOpen(s.id);
          }}
        >
          <div className="lf-topline">
            <span className="lf-meta">
              {s.folder ? `${s.folder} · ` : ""}
              {formatNoteDate(s.createdAt)}
            </span>
            <span className="lf-side">
              <MiniWave seed={s.id} />
              <span className="lf-dur">{formatTime(s.durationSec)}</span>
            </span>
          </div>
          <h2 className="lf-row-title">{s.title}</h2>
          {s.snippet && <p className="lf-snippet">{s.snippet}</p>}
          {s.tags.length > 0 && (
            <div className="lf-tags">
              {s.tags.map((t) => (
                <span key={t} className="tc-mini">
                  {t}
                </span>
              ))}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
