import { createStore } from "../create-store";

/**
 * The asset-load pipeline's single source of truth.
 *
 * Three values move independently and every one of them is MONOTONIC — loading
 * only ever goes forward. That matters as much as the numbers: a value that can
 * go backwards makes the bar stutter and the reveal replay.
 */
export type ProgressState = {
  /** Raw 0..100 blend of model load and byte prefetch. */
  progress: number;
  /**
   * The SMOOTHED 0..1 value, written from inside the canvas on the render loop.
   * Both the HUD bar and the in-scene reveal read this one, so the bar can
   * never reach 100% before the effect it is describing has finished.
   */
  revealProgress: number;
  /** Byte-accurate warm of the secondary assets, 0..1. */
  prefetchProgress: number;
  assetsWarmed: boolean;
  isLoaded: boolean;
  isRevealed: boolean;

  setProgress: (value: number) => void;
  setRevealProgress: (value: number) => void;
  setPrefetchProgress: (value: number) => void;
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
  assetsWarmed: false,
  isLoaded: false,
  isRevealed: false,

  // Each of these is called every frame during a load. Returning the CURRENT
  // value when it would not advance means the factory's guard drops the write,
  // so a frame that made no progress wakes no subscribers at all.
  setProgress: (value) => set({ progress: Math.max(get().progress, value) }),
  setRevealProgress: (value) => set({ revealProgress: Math.max(get().revealProgress, value) }),
  setPrefetchProgress: (value) => set({ prefetchProgress: Math.max(get().prefetchProgress, value) }),

  setAssetsWarmed: (value) => set({ assetsWarmed: value }),
  setLoaded: (value) => set({ isLoaded: value }),
  setRevealed: (value) => set({ isRevealed: value }),

  // prefetchProgress / assetsWarmed are NOT reset: the HTTP cache stays warm for
  // the whole session, so that work is done once and must survive a scene reset.
  reset: () => set({ progress: 0, revealProgress: 0, isLoaded: false, isRevealed: false }),
}));
