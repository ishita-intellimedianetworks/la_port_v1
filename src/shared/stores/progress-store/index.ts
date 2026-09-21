import { createStore } from "../create-store";

export type ProgressState = {
  /** Raw 0..100 blend of model load and byte prefetch. */
  progress: number;
  revealProgress: number;
  /** Byte-accurate warm of the secondary assets, 0..1. */
  prefetchProgress: number;
  streamProgress: number;
  streamDressing: number;
  assetsWarmed: boolean;
  isLoaded: boolean;
  isRevealed: boolean;

  setProgress: (value: number) => void;
  setRevealProgress: (value: number) => void;
  setPrefetchProgress: (value: number) => void;
  setStreamProgress: (value: number) => void;
  /** Free-moving, unlike the setters above — see `streamDressing`. */
  setStreamDressing: (value: number) => void;
  /** Back to 0 for a fresh streamer mount. See `streamProgress`. */
  resetStreamProgress: () => void;
  setAssetsWarmed: (value: boolean) => void;
  setLoaded: (value: boolean) => void;
  setRevealed: (value: boolean) => void;
  /** Back to the start of a load. Warm-cache progress deliberately survives. */
  reset: () => void;
};

export const useProgressStore = createStore<ProgressState>((set, get) => ({
  progress: 0,
  revealProgress: 0,
  prefetchProgress: 0,
  streamProgress: 0,
  streamDressing: 0,
  assetsWarmed: false,
  isLoaded: false,
  isRevealed: false,

  setProgress: (value) => set({ progress: Math.max(get().progress, value) }),
  setRevealProgress: (value) => set({ revealProgress: Math.max(get().revealProgress, value) }),
  setPrefetchProgress: (value) => set({ prefetchProgress: Math.max(get().prefetchProgress, value) }),
  setStreamProgress: (value) => set({ streamProgress: Math.max(get().streamProgress, value) }),
  resetStreamProgress: () => set({ streamProgress: 0 }),
  setStreamDressing: (value) => set({ streamDressing: value }),

  setAssetsWarmed: (value) => set({ assetsWarmed: value }),
  setLoaded: (value) => set({ isLoaded: value }),
  setRevealed: (value) => set({ isRevealed: value }),

  // prefetchProgress / assetsWarmed are NOT reset: the HTTP cache stays warm for
  // the whole session, so that work is done once and must survive a scene reset.
  reset: () => set({ progress: 0, revealProgress: 0, streamProgress: 0, isLoaded: false, isRevealed: false }),
}));
