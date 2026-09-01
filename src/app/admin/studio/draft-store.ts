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

/** The draft as it was left last session, or a fresh clone of the file. Read
 *  lazily inside the store initialiser so SSR never touches `localStorage`. */
function loadInitial(): SiteConfig {
  if (typeof window === "undefined") return clone(BASELINE);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SiteConfig;
  } catch {
    /* a corrupt or oversized entry is not worth failing the page over */
  }
  return clone(BASELINE);
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
  draft: loadInitial(),
  past: [],
  future: [],
  dirty: false,

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
