import { useEffect, useRef } from "react";
import { useFocus } from "@core/focus";

/** Shared audio player: the single source of truth for `currentTime`. Mounted once by
 *  the shell so every experience drives and follows the same playback. */
export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const registerSeek = useFocus((s) => s.registerSeek);
  const setCurrentTime = useFocus((s) => s.setCurrentTime);
  const setDuration = useFocus((s) => s.setDuration);
  const setPlaying = useFocus((s) => s.setPlaying);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    registerSeek((t) => {
      audio.currentTime = t;
      void audio.play().catch(() => {});
    });
  }, [registerSeek, src]);

  return (
    <audio
      ref={ref}
      src={src}
      controls
      style={{ width: "100%" }}
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
    />
  );
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
