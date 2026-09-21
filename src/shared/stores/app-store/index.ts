import { createStore } from "../create-store";

const SEEN_KEYS = {
  dollhouse: "holotwin.instructions.dollhouse.v1",
  firstPerson: "holotwin.instructions.firstPerson.v1",
} as const;

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
  sceneRevealed: boolean;
  setSceneRevealed: (value: boolean) => void;

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
