import { createStore } from "../create-store";

export type ProgressState = {
  progress: number;
  revealProgress: number;
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
  setStreamDressing: (value: number) => void;
  resetStreamProgress: () => void;
  setAssetsWarmed: (value: boolean) => void;
  setLoaded: (value: boolean) => void;
  setRevealed: (value: boolean) => void;
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

  reset: () => set({ progress: 0, revealProgress: 0, streamProgress: 0, isLoaded: false, isRevealed: false }),
}));
