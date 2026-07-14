// Browser-only UI state. The single shared signal through which experiences sync WITHOUT
// referencing each other: the audio player owns `currentTime`; experiences read it (to
// highlight) and call `seek` (to jump). An experience that ignores this stays isolated.
import { create } from "zustand";

interface FocusState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** Optional "what's focused" markers other experiences can react to. */
  activeChunkId?: string;
  activeConceptId?: string;

  // The AudioPlayer registers its imperative seek; experiences call `seek`.
  _seek?: (t: number) => void;
  registerSeek: (fn: (t: number) => void) => void;
  seek: (t: number, focus?: { activeChunkId?: string; activeConceptId?: string }) => void;

  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setPlaying: (p: boolean) => void;
  setFocus: (focus: { activeChunkId?: string; activeConceptId?: string }) => void;
  reset: () => void;
}

export const useFocus = create<FocusState>((set, get) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,

  registerSeek: (fn) => set({ _seek: fn }),
  seek: (t, focus) => {
    get()._seek?.(t);
    set({ currentTime: t, ...(focus ?? {}) });
  },

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setPlaying: (p) => set({ isPlaying: p }),
  setFocus: (focus) => set(focus),
  reset: () =>
    set({
      currentTime: 0,
      isPlaying: false,
      activeChunkId: undefined,
      activeConceptId: undefined,
    }),
}));
