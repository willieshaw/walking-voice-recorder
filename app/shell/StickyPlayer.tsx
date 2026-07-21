// The memo view's sticky playback bar: outlined play button, a real waveform (played
// bars dark, chapter-start flags), YouTube-style chapter segments beneath it whose titles
// appear under the segment on hover (the current chapter's title stays visible), + clock.
// Purely a focus-store consumer — the hidden AudioPlayer owns currentTime.
import { useEffect, useRef, useState } from "react";
import type { Annotation, Note } from "@core/types";
import type { CombinedSegment } from "@core/combine";
import { deriveAnnotations } from "@core/annotations";
import { useFocus } from "@core/focus";
import { AudioPlayer, formatTime } from "../components/AudioPlayer";
import { ChainedAudioPlayer } from "../components/ChainedAudioPlayer";
import { getCombinedPeaks, getPeaks } from "../lib/peaks";
import "./sticky-player.css";

const WAVE_HEIGHT = 32;
// Decode the audio to a high-resolution peak array once; the number of bars actually drawn
// is chosen from the container width at a fixed pitch, so the waveform keeps a constant bar
// density (and re-densifies on resize) instead of stretching the same bars ever thinner.
const SOURCE_BUCKETS = 500;
const BAR_PITCH = 6; // px per bar, including its gap
const STICKY_TOP = 12; // must match `.sp-sticky { top }` in sticky-player.css

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

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function StickyPlayer({ note, segments }: { note: Note; segments?: CombinedSegment[] }) {
  const currentTime = useFocus((s) => s.currentTime);
  const isPlaying = useFocus((s) => s.isPlaying);
  const seek = useFocus((s) => s.seek);
  const togglePlay = useFocus((s) => s.togglePlay);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [stuck, setStuck] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const duration = note.durationSec || 1;
  const moments = deriveAnnotations(note).filter((a) => a.kind === "moment");
  const chapters = toChapters(moments, duration);
  const current = chapters.find((c) => currentTime >= c.tStart && currentTime < c.tEnd);
  // Full height at the top of the note; collapses to a slim bar once stuck, and
  // re-expands on hover so the chapters stay one gesture away.
  const expanded = !collapsed || hover;

  // "Stuck" = the card has actually reached the top of the scroll area (its sticky offset),
  // not merely that the page scrolled at all.
  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest(".main") as HTMLElement | null;
    if (!root || !scroller) return;
    const onScroll = () => {
      const refTop = scroller.getBoundingClientRect().top + STICKY_TOP;
      setStuck(root.getBoundingClientRect().top <= refTop + 1);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [note.id]);

  // Collapse is a SEPARATE, deferred motion: the card sticks first, then a beat later it
  // folds shut in one gesture — so the fold doesn't ride frame-by-frame with the scroll.
  // Un-sticking (scrolling back to the top) re-expands immediately, no delay.
  useEffect(() => {
    if (!stuck) {
      setCollapsed(false);
      return;
    }
    const t = window.setTimeout(() => setCollapsed(true), 220);
    return () => window.clearTimeout(t);
  }, [stuck]);

  // A combined note stitches one waveform from its sources; a plain note decodes its own blob.
  const segKey = segments?.map((s) => s.noteId).join(",");
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    const load =
      segments && segments.length
        ? getCombinedPeaks(segments, SOURCE_BUCKETS)
        : getPeaks(note.id, note.audioUrl, SOURCE_BUCKETS);
    load
      .then((p) => !cancelled && setPeaks(p))
      .catch(() => {}); // no waveform (undecodable audio) — the bars row still works
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, note.audioUrl, segKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !peaks) return;

    function draw() {
      if (!canvas || !wrap || !peaks) return;
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      canvas.width = width * dpr;
      canvas.height = WAVE_HEIGHT * dpr;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);

      const played = cssVar("--text-2") || "#52525b";
      const unplayed = "#d9d9de";
      // Bar count follows the width (constant density), capped by the source resolution.
      const src = peaks.length;
      const n = Math.max(8, Math.min(src, Math.round(width / BAR_PITCH)));
      const slot = width / n;
      const barW = Math.max(slot * 0.6, 1.5);
      const playedFrac = Math.min(currentTime / duration, 1);

      g.clearRect(0, 0, width, WAVE_HEIGHT);
      for (let b = 0; b < n; b++) {
        // Downsample: this display bar is the loudest source peak in its slice.
        let peak = 0;
        const from = Math.floor((b / n) * src);
        const to = Math.max(from + 1, Math.floor(((b + 1) / n) * src));
        for (let i = from; i < to; i++) if (peaks[i] > peak) peak = peaks[i];
        const h = Math.max(3, peak * WAVE_HEIGHT);
        const x = b * slot + (slot - barW) / 2;
        const y = (WAVE_HEIGHT - h) / 2;
        g.fillStyle = (b + 0.5) / n <= playedFrac ? played : unplayed;
        g.beginPath();
        g.roundRect(x, y, barW, h, barW / 2);
        g.fill();
      }
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    window.addEventListener("resize", draw); // belt-and-suspenders for viewport width changes
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [peaks, currentTime, duration]);

  return (
    <div className="sp-sticky" ref={rootRef}>
      {segments && segments.length ? (
        <ChainedAudioPlayer segments={segments} />
      ) : (
        <AudioPlayer src={note.audioUrl} hidden />
      )}
      <div
        className={`spl-card${stuck ? " sp-stuck" : ""}${expanded ? "" : " sp-min"}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button className="sp-play" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 4.5v15l12-7.5z" />
            </svg>
          )}
        </button>

        <div className="sp-middle">
          <div className="sp-wave" ref={wrapRef}>
            {peaks && (
              <canvas
                ref={canvasRef}
                className="sp-canvas"
                style={{ height: WAVE_HEIGHT }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - rect.left) / rect.width) * duration);
                }}
              />
            )}
            {peaks &&
              chapters
                .filter((c) => c.label)
                .map((c, i) => (
                  <span
                    key={i}
                    className="sp-flag"
                    style={{ left: `${(c.tStart / duration) * 100}%` }}
                  />
                ))}
          </div>

          <div className="sp-segrow">
            {chapters.map((c, i) => {
              const frac = Math.min(
                Math.max((currentTime - c.tStart) / (c.tEnd - c.tStart), 0),
                1,
              );
              const active = c === current;
              return (
                <div key={i} className="sp-seg" style={{ flexGrow: c.tEnd - c.tStart }}>
                  <button
                    className="sp-bar"
                    title={c.label ? `${c.label} — ${formatTime(c.tStart)}` : formatTime(c.tStart)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      seek(
                        c.tStart + ((e.clientX - rect.left) / rect.width) * (c.tEnd - c.tStart),
                      );
                    }}
                  >
                    <span className="sp-fill" style={{ width: `${frac * 100}%` }} />
                  </button>
                  {c.label && (
                    <span className={`sp-label${active ? " sp-label-active" : ""}`}>
                      {c.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <span className="sp-clock">
          {formatTime(currentTime)} / {formatTime(note.durationSec)}
        </span>
      </div>
    </div>
  );
}
