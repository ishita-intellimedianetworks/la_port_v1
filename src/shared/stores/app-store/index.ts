import { createStore } from "../create-store";

export type AppState = {
  /**
   * False while a blackout is up, true once the scene is visible. Gates the UI
   * entrance so panels slide in AFTER the fade clears rather than behind it.
   */
  sceneRevealed: boolean;
  setSceneRevealed: (value: boolean) => void;

  /**
   * Whether each instructions card has been dismissed THIS page load.
   *
   * Two flags, not one: the cards are met at different moments — the dollhouse
   * card before entering, the first-person card on arriving inside — and
   * someone who has read one has not necessarily reached the other yet.
   *
   * Deliberately not persisted. This is a demo that gets opened in front of an
   * audience, and instructions that vanish on the second visit because a
   * previous viewer dismissed them are instructions nobody can find. Both cards
   * show once per load; the dock's Instructions button reopens the
   * first-person one on demand.
   */
  instructionsSeen: boolean;
  markInstructionsSeen: () => void;
  fpInstructionsSeen: boolean;
  markFpInstructionsSeen: () => void;
};

export const useAppStore = createStore<AppState>((set) => ({
  sceneRevealed: true,
  instructionsSeen: false,
  fpInstructionsSeen: false,

  setSceneRevealed: (value) => set({ sceneRevealed: value }),
  markInstructionsSeen: () => set({ instructionsSeen: true }),
  markFpInstructionsSeen: () => set({ fpInstructionsSeen: true }),
}));
