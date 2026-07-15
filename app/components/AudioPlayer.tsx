import { useEffect, useRef } from "react";
import { useFocus } from "@core/focus";

/** Shared audio player: the single source of truth for `currentTime`. Mounted once by
 *  the shell so every experience drives and follows the same playback. With `hidden`,
 *  the element still plays but shows no native controls — custom UIs (the sticky chapter
 *  player) drive it through the focus store's seek/togglePlay. */
export function AudioPlayer({ src, hidden = false }: { src: string; hidden?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const registerSeek = useFocus((s) => s.registerSeek);
  const registerToggle = useFocus((s) => s.registerToggle);
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
    registerToggle(() => {
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
    });
  }, [registerSeek, registerToggle, src]);

  return (
    <audio
      ref={ref}
      src={src}
      controls={!hidden}
      style={hidden ? { display: "none" } : { width: "100%" }}
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
