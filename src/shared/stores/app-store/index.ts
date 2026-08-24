import { createStore } from "../create-store";

/**
 * localStorage keys for the "already read the instructions" flags.
 *
 * VERSIONED on purpose: the suffix is bumped whenever the cards are re-authored
 * so a rewrite is shown once to everyone who already dismissed the old one.
 * Without that, the people most familiar with the app are the only ones who
 * never see what changed.
 */
const SEEN_KEYS = {
  dollhouse: "holotwin.instructions.dollhouse.v1",
  firstPerson: "holotwin.instructions.firstPerson.v1",
} as const;

/**
 * Storage access, guarded twice: `window` is absent while Next pre-renders,
 * and `localStorage` itself THROWS (not returns null) in a Safari private
 * window and wherever site data is blocked. A viewer with cookies off should
 * still get the app — they just get the instructions every visit.
 */
function readSeen(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSeen(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable — the flag simply doesn't persist */
  }
}

export type AppState = {
  /**
   * False while a blackout is up, true once the scene is visible. Gates the UI
   * entrance so panels slide in AFTER the fade clears rather than behind it.
   */
  sceneRevealed: boolean;
  setSceneRevealed: (value: boolean) => void;

  /**
   * Whether each instructions card has been dismissed — PERSISTED in
   * localStorage, so a card discovered once never interrupts again.
   *
   * Two flags, not one: the cards are met at different moments — the dollhouse
   * card before entering, the first-person card on arriving inside — and
   * someone who has read one has not necessarily reached the other yet.
   *
   * Dismissing is not the only way back in: the dock's Instructions button
   * reopens the first-person card on demand, which is what makes persisting
   * safe. The card is a reference, not a gate.
   */
  instructionsSeen: boolean;
  markInstructionsSeen: () => void;
  fpInstructionsSeen: boolean;
  markFpInstructionsSeen: () => void;
  /** Clear both flags (both cards show again on the next visit). */
  resetInstructionsSeen: () => void;
};

export const useAppStore = createStore<AppState>((set) => ({
  sceneRevealed: true,
  instructionsSeen: readSeen(SEEN_KEYS.dollhouse),
  fpInstructionsSeen: readSeen(SEEN_KEYS.firstPerson),

  setSceneRevealed: (value) => set({ sceneRevealed: value }),
  markInstructionsSeen: () => {
    writeSeen(SEEN_KEYS.dollhouse);
    set({ instructionsSeen: true });
  },
  markFpInstructionsSeen: () => {
    writeSeen(SEEN_KEYS.firstPerson);
    set({ fpInstructionsSeen: true });
  },
  resetInstructionsSeen: () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SEEN_KEYS.dollhouse);
        window.localStorage.removeItem(SEEN_KEYS.firstPerson);
      } catch {
        /* nothing to clear */
      }
    }
    set({ instructionsSeen: false, fpInstructionsSeen: false });
  },
}));
