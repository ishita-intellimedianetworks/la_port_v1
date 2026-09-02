"use client";

/**
 * The admin studio's working copy of `site.json`.
 *
 * ONE draft object, shaped exactly like the file, edited by every step and
 * written back out verbatim at the end. That is the whole design: the studio
 * never invents an intermediate model that then has to be projected back — a
 * step reaches into the path it owns (`draft.lights.sunIntensity`,
 * `draft.layouts[3].camera`) and the exporter is `JSON.stringify(draft)`.
 *
 * Why that matters here: `site.json` carries long `_note` blocks explaining why
 * half its numbers are what they are, and those notes are the only record of
 * (for instance) which `cp_NNN` node a camera came from. A studio that rebuilt
 * the file from a normalised model would silently drop every one of them. A
 * studio that edits a clone keeps them by construction, including on keys it
 * has no UI for at all (`stream`, `streamV2`, `map`, `copy`).
 *
 * `update()` clones before mutating rather than reaching for immer: the file is
 * ~200 KB of plain JSON, `structuredClone` handles it in well under a frame,
 * and it keeps the studio dependency-free. History is kept as a bounded stack
 * of those clones, which is what makes undo a pointer move.
 */

import { create } from "zustand";
import siteJson from "@/config/site.json";
import type { SiteConfig } from "@/config/schema";

/** The shipped file, frozen — `reset()` and the review step's diff read it. */
export const BASELINE = siteJson as unknown as SiteConfig;

const STORAGE_KEY = "la-port-admin-draft-v1";
/** Deep enough to undo a session's worth of slider dragging, bounded so a long
 *  session does not hold a hundred copies of the document in memory. */
const HISTORY_LIMIT = 60;

function clone(value: SiteConfig): SiteConfig {
  return structuredClone(value);
}

/**
 * The draft as it was left last session, or null.
 *
 * DELIBERATELY NOT READ IN THE STORE INITIALISER, which is where it used to
 * be. `/admin` is prerendered, so the HTML is built from BASELINE; a store
 * that restored a saved draft while being created would hand React a
 * DIFFERENT tree on the client's very first render, and the page died with a
 * hydration mismatch — the step bar's warning pips are computed from the
 * draft, so a saved draft with one more unplaced hotspot than the shipped
 * file is enough to diverge.
 *
 * Guarding the read with `typeof window` does not help: the server is not the
 * problem, the client's FIRST render is, and that has to match the HTML. So
 * both start from BASELINE and `hydrate()` swaps the saved draft in from an
 * effect, one render later, when React is past the comparison.
 */
function loadStored(): SiteConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SiteConfig) : null;
  } catch {
    /* a corrupt or oversized entry is not worth failing the page over */
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced, because a slider drag calls `update()` on every pointer move and
 *  `localStorage.setItem` is synchronous against the disk. */
function persist(draft: SiteConfig) {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* quota — the draft still lives in memory, and the review step can
         always download it */
    }
  }, 400);
}

export type DraftState = {
  draft: SiteConfig;
  /** Past states, oldest first. The present is `draft`, never in here. */
  past: SiteConfig[];
  future: SiteConfig[];
  /** True once anything diverges from `BASELINE`. */
  dirty: boolean;
  /** True once the saved draft has been looked for. Until then the store holds
   *  the shipped file, which is what the prerendered HTML shows. */
  hydrated: boolean;

  /** Restore last session's draft. Called once from an effect — see
   *  `loadStored` for why it cannot happen any earlier. */
  hydrate: () => void;

  /**
   * Edit the draft.
   *
   * `recipe` mutates a CLONE — mutate freely, return nothing. Pass
   * `{ history: false }` for the continuous edits of a drag, so one gesture
   * lands as one undo step rather than two hundred.
   */
  update: (recipe: (draft: SiteConfig) => void, opts?: { history?: boolean }) => void;
  /** Replace the whole document — the "load a different site.json" path. */
  replace: (next: SiteConfig) => void;
  /** Back to the file as it ships. */
  reset: () => void;
  undo: () => void;
  redo: () => void;
  /** Called after a successful write to disk, so the header stops warning. */
  markSaved: () => void;
};

export const useDraftStore = create<DraftState>()((set, get) => ({
  draft: clone(BASELINE),
  past: [],
  future: [],
  dirty: false,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadStored();
    if (!stored) {
      set({ hydrated: true });
      return;
    }
    // History starts here rather than carrying the baseline as a first entry:
    // undoing back past a restore into the shipped file is not an edit anyone
    // made, and "Discard draft" is the button for that.
    set({
      draft: stored,
      hydrated: true,
      dirty: JSON.stringify(stored) !== JSON.stringify(BASELINE),
    });
  },

  update: (recipe, opts) => {
    const { draft, past } = get();
    const next = clone(draft);
    recipe(next);
    const history = opts?.history !== false;
    persist(next);
    set({
      draft: next,
      // A no-history edit still replaces the present, but leaves the stack
      // alone — so undo jumps back to before the gesture started.
      past: history ? [...past, draft].slice(-HISTORY_LIMIT) : past,
      future: [],
      dirty: true,
    });
  },

  replace: (next) => {
    const { draft, past } = get();
    persist(next);
    set({
      draft: next,
      past: [...past, draft].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
    });
  },

  reset: () => {
    const { draft, past } = get();
    const next = clone(BASELINE);
    // Overwrite the saved copy too, not just the one in memory — discarding a
    // draft that comes back on reload has discarded nothing.
    persist(next);
    set({ draft: next, past: [...past, draft].slice(-HISTORY_LIMIT), future: [], dirty: false });
  },

  undo: () => {
    const { past, draft, future } = get();
    if (!past.length) return;
    const previous = past[past.length - 1];
    persist(previous);
    set({ draft: previous, past: past.slice(0, -1), future: [draft, ...future], dirty: true });
  },

  redo: () => {
    const { future, draft, past } = get();
    if (!future.length) return;
    const next = future[0];
    persist(next);
    set({ draft: next, past: [...past, draft].slice(-HISTORY_LIMIT), future: future.slice(1), dirty: true });
  },

  markSaved: () => set({ dirty: false }),
}));

/** Imperative read, for callbacks that fire outside React's render. */
export const getDraft = () => useDraftStore.getState().draft;
export const updateDraft = useDraftStore.getState().update;
