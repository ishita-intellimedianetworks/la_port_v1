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
  /**
   * The adaptive chunk streamer's fill for the CURRENT mount, 0..1 — the share
   * of the chunks queued for the landing view that are actually on screen.
   *
   * It exists because drei's `useProgress` cannot see this work: the streamer
   * drives its own `GLTFLoader`, so from drei's point of view the whole
   * terminal is one already-finished file. The entry blackout holds on it,
   * which is why it is the one value here that is NOT monotonic across the
   * session: `resetStreamProgress` puts it back to 0 each time the streamer
   * mounts, so the second walk-in waits for its own fill and not the first
   * one's. It stays monotonic WITHIN a mount.
   */
  streamProgress: number;
  /**
   * How many mounted chunks are still wearing the wrong tier or texture rung
   * for where the camera is — `StreamStats.dressing`, republished here so an
   * HTML overlay outside the canvas can read it.
   *
   * The ONE value in this store that is neither monotonic nor a fraction: it
   * rises the moment the camera jumps and falls as the streamer catches up, and
   * a transition blackout holds until it has. Everything else here describes a
   * load that happens once; this describes a view that re-dresses every time
   * the camera moves a long way.
   */
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

  // Each of these is called every frame during a load. Returning the CURRENT
  // value when it would not advance means the factory's guard drops the write,
  // so a frame that made no progress wakes no subscribers at all.
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
