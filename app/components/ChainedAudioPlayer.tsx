// Plays several source clips as ONE continuous timeline — the audio side of a combined note.
// Like AudioPlayer it's the sole owner of playback and drives the focus store, but it maps a
// single global `currentTime` across N clips: seeking picks the right clip + local offset,
// and a clip ending auto-advances to the next. The custom sticky player (which reads global
// time and calls seek) needs no knowledge that playback is stitched together.
import { useEffect, useRef, useState } from "react";
import { useFocus } from "@core/focus";
import type { CombinedSegment } from "@core/combine";

export function ChainedAudioPlayer({ segments }: { segments: CombinedSegment[] }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const registerSeek = useFocus((s) => s.registerSeek);
  const registerToggle = useFocus((s) => s.registerToggle);
  const setCurrentTime = useFocus((s) => s.setCurrentTime);
  const setDuration = useFocus((s) => s.setDuration);
  const setPlaying = useFocus((s) => s.setPlaying);

  // The total timeline length is known up front (sum of clip durations).
  const total = segments.reduce((sum, s) => sum + s.duration, 0);

  // Keep the latest segments/index reachable from the store callbacks without re-registering.
  const segRef = useRef(segments);
  const idxRef = useRef(index);
  segRef.current = segments;
  idxRef.current = index;
  // When advancing to the next clip we want it to start playing; a plain seek shouldn't.
  const playAfterLoad = useRef(false);

  useEffect(() => setDuration(total), [total, setDuration]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    /** Map a global time to (clip index, local time within that clip). */
    function locate(globalT: number): { i: number; local: number } {
      const segs = segRef.current;
      let t = Math.max(0, Math.min(globalT, total));
      for (let i = 0; i < segs.length; i++) {
        if (t < segs[i].duration || i === segs.length - 1) return { i, local: t };
        t -= segs[i].duration;
      }
      return { i: 0, local: 0 };
    }

    registerSeek((globalT) => {
      const { i, local } = locate(globalT);
      playAfterLoad.current = true;
      if (i === idxRef.current) {
        audio.currentTime = local;
        void audio.play().catch(() => {});
      } else {
        // Switching clips: set the pending local time, swap src (via index), play on load.
        pendingLocal.current = local;
        setIndex(i);
      }
    });

    registerToggle(() => {
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
    });
  }, [registerSeek, registerToggle, setDuration, total]);

  // The local time to seek to once a freshly-swapped clip has loaded its metadata.
  const pendingLocal = useRef<number | null>(null);

  const seg = segments[index];
  const offset = seg?.offset ?? 0;

  return (
    <audio
      ref={ref}
      src={seg?.audioUrl}
      style={{ display: "none" }}
      onLoadedMetadata={(e) => {
        if (pendingLocal.current != null) {
          e.currentTarget.currentTime = pendingLocal.current;
          pendingLocal.current = null;
        }
        if (playAfterLoad.current) {
          playAfterLoad.current = false;
          void e.currentTarget.play().catch(() => {});
        }
      }}
      onTimeUpdate={(e) => setCurrentTime(offset + e.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => {
        if (index < segments.length - 1) {
          playAfterLoad.current = true;
          pendingLocal.current = 0;
          setIndex(index + 1);
        } else {
          setPlaying(false);
        }
      }}
    />
  );
}
