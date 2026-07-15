// The memo view's sticky playback bar: play/pause + a YouTube-style chapter strip whose
// chapters are the note's "moment" annotations, + a clock. Purely a focus-store consumer —
// the (hidden) AudioPlayer stays the single owner of currentTime.
import type { Annotation, Note } from "@core/types";
import { deriveAnnotations } from "@core/annotations";
import { useFocus } from "@core/focus";
import { AudioPlayer, formatTime } from "../components/AudioPlayer";
import "./sticky-player.css";

interface Chapter {
  label: string | null;
  tStart: number;
  tEnd: number;
}

/** Cut the timeline into chapters at each moment's start. A leading unlabeled chapter is
 *  added when the first moment starts late; no moments = one unlabeled chapter. */
function toChapters(moments: Annotation[], duration: number): Chapter[] {
  if (!moments.length) return [{ label: null, tStart: 0, tEnd: duration }];
  const chapters: Chapter[] = [];
  if (moments[0].tStart > 1) chapters.push({ label: null, tStart: 0, tEnd: moments[0].tStart });
  moments.forEach((m, i) => {
    chapters.push({
      label: m.label,
      tStart: m.tStart,
      tEnd: i + 1 < moments.length ? moments[i + 1].tStart : duration,
    });
  });
  return chapters;
}

export function StickyPlayer({ note }: { note: Note }) {
  const currentTime = useFocus((s) => s.currentTime);
  const isPlaying = useFocus((s) => s.isPlaying);
  const seek = useFocus((s) => s.seek);
  const togglePlay = useFocus((s) => s.togglePlay);

  const duration = note.durationSec || 1;
  const moments = deriveAnnotations(note).filter((a) => a.kind === "moment");
  const chapters = toChapters(moments, duration);
  const current = chapters.find((c) => currentTime >= c.tStart && currentTime < c.tEnd);

  return (
    <div className="sp-sticky">
      <AudioPlayer src={note.audioUrl} hidden />
      <div className="sp-card">
        <button
          className="sp-play"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
          )}
        </button>

        <div className="sp-strip">
          {chapters.map((c, i) => {
            const frac = Math.min(Math.max((currentTime - c.tStart) / (c.tEnd - c.tStart), 0), 1);
            return (
              <button
                key={i}
                className="sp-chapter"
                style={{ flexGrow: c.tEnd - c.tStart }}
                title={c.label ? `${c.label} — ${formatTime(c.tStart)}` : formatTime(c.tStart)}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const t = c.tStart + ((e.clientX - rect.left) / rect.width) * (c.tEnd - c.tStart);
                  seek(t);
                }}
              >
                <span className="sp-fill" style={{ width: `${frac * 100}%` }} />
              </button>
            );
          })}
        </div>

        <div className="sp-meta">
          {current?.label && <span className="sp-chapter-label">{current.label}</span>}
          <span className="sp-clock">
            {formatTime(currentTime)} / {formatTime(note.durationSec)}
          </span>
        </div>
      </div>
    </div>
  );
}
