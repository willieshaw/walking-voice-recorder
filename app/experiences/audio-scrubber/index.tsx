// SoundCloud-style scrubber: the waveform as the timeline, with the note's key moments
// as clickable markers on top. Purely a focus-store consumer — the AudioPlayer stays the
// single source of truth for playback.
import { useEffect, useRef, useState } from "react";
import type { Note } from "@core/types";
import { useFocus } from "@core/focus";
import { formatTime } from "../../components/AudioPlayer";
import type { Experience } from "../types";
import { getPeaks } from "./peaks";
import "./audio-scrubber.css";

const WAVE_HEIGHT = 96;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function AudioScrubber({ note }: { note: Note }) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTime = useFocus((s) => s.currentTime);
  const seek = useFocus((s) => s.seek);
  // The stored duration is the stable timeline length (focus duration is 0 until the
  // audio element loads its metadata).
  const duration = note.durationSec || 1;
  const moments = note.keymoments ?? [];

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setLoadError(null);
    getPeaks(note.id, note.audioUrl)
      .then((p) => !cancelled && setPeaks(p))
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [note.id, note.audioUrl]);

  // Redraw the bars whenever peaks, playhead, or wrapper width change.
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

      const played = cssVar("--accent") || "#c8772e";
      const unplayed = cssVar("--border") || "#e6e3dd";
      const n = peaks.length;
      const barW = width / n;
      const playedFrac = Math.min(currentTime / duration, 1);

      g.clearRect(0, 0, width, WAVE_HEIGHT);
      for (let b = 0; b < n; b++) {
        const h = Math.max(2, peaks[b] * WAVE_HEIGHT);
        g.fillStyle = (b + 0.5) / n <= playedFrac ? played : unplayed;
        g.fillRect(b * barW, (WAVE_HEIGHT - h) / 2, Math.max(barW - 1, 1), h);
      }
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [peaks, currentTime, duration]);

  function handleScrub(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * duration);
  }

  if (loadError) {
    return <p className="error">Couldn't decode this audio for a waveform: {loadError}</p>;
  }

  return (
    <div className="scrub">
      <div className="scrub-wave" ref={wrapRef}>
        {peaks ? (
          <>
            <canvas
              ref={canvasRef}
              className="scrub-canvas"
              style={{ height: WAVE_HEIGHT }}
              onClick={handleScrub}
            />
            <div
              className="scrub-playhead"
              style={{ left: `${Math.min(currentTime / duration, 1) * 100}%` }}
            />
            {moments.map((m) => (
              <button
                key={m.id}
                className={`scrub-marker${
                  currentTime >= m.tStart && currentTime < m.tEnd ? " scrub-marker-active" : ""
                }`}
                style={{
                  left: `${(m.tStart / duration) * 100}%`,
                  width: `${Math.max(((m.tEnd - m.tStart) / duration) * 100, 0.5)}%`,
                }}
                onClick={() => seek(m.tStart)}
              >
                <span className="scrub-marker-label">
                  {m.label} — {formatTime(m.tStart)}
                </span>
              </button>
            ))}
          </>
        ) : (
          <p className="hint">Analyzing waveform…</p>
        )}
      </div>
      <div className="scrub-time">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(note.durationSec)}</span>
      </div>
      {peaks && moments.length === 0 && (
        <p className="hint">No key moments were found in this recording.</p>
      )}
    </div>
  );
}

export const audioScrubber: Experience = {
  id: "audio-scrubber",
  title: "Scrubber",
  requires: ["audio", "keymoments"],
  Component: AudioScrubber,
};
