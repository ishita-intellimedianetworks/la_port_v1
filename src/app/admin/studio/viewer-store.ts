"use client";

/**
 * Everything the viewer and the step panels have to agree on, and NOTHING that
 * belongs in the file being authored.
 *
 * The split is the point. `draft-store` holds what will be written to
 * `site.json`; this holds the session — which model is loaded, what is
 * selected, which pose the orbit camera is sitting at right now. Reload the
 * page and the draft comes back while all of this is discarded, which is the
 * correct behaviour for both.
 *
 * The panels and the canvas are siblings (the canvas is mounted once, at the
 * shell, so switching steps never remounts the model), so they cannot talk
 * through props. This store is the wire: a panel raises `requestFly`, the
 * controls component consumes it; the controls publish `livePose`, a panel
 * reads it when the user presses "Set from view".
 */

import * as THREE from "three";
import { create } from "zustand";
import type { CameraPose } from "@/config/schema";

/** What a click in the viewport is FOR. */
export type ViewerMode =
  /** Orbit only. Clicking a marker selects it. */
  | "orbit"
  /** Clicking the model writes the hit point into the selected entity's
   *  position — the fastest way to place a hotspot on a crane. */
  | "place";

/** The thing the step panels and the viewer both consider "current". A gizmo
 *  in the scene is drawn highlighted for it and TransformControls attaches to
 *  it, so both halves of the app agree what a drag will move. */
export type Selection =
  | { kind: "none" }
  /** One of the three `cameras.*` poses. */
  | { kind: "sceneCamera"; id: "dollhouse" | "spawn" | "firstPerson" }
  /** A layout — `part` says whether the gizmo is its marker or its camera. */
  | { kind: "layout"; id: string; part: "position" | "camera" }
  | { kind: "hotspot"; id: string; part: "position" | "camera" };

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "none" || b.kind === "none") return true;
  if (a.kind === "sceneCamera" && b.kind === "sceneCamera") return a.id === b.id;
  if (b.kind === "sceneCamera" || a.kind === "sceneCamera") return false;
  return a.id === b.id && a.part === b.part;
}

/** Where the model comes from. A checkout has no GLB under `public/models`
 *  (the terminal streams chunks instead), so "pick a file" is not a fallback
 *  here — it is the normal path, and the URL option is for a build that does
 *  ship one or serves it from the asset base. */
export type ModelSource =
  | { kind: "none" }
  | { kind: "url"; url: string; label: string }
  | { kind: "file"; url: string; label: string };

export type ViewerState = {
  model: ModelSource;
  /** Object URLs from a picked file have to be revoked, so the setter does it
   *  for the source it replaces. */
  setModel: (next: ModelSource) => void;
  modelError: string | null;
  setModelError: (message: string | null) => void;

  /** World bounds of the loaded model, published on load. Drives the grid, the
   *  default orbit framing and the fallback focus distance. */
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  setBounds: (bounds: ViewerState["bounds"]) => void;

  /**
   * Download progress, 0–1, or null when nothing is in flight.
   *
   * It reaches 1 well BEFORE the model appears: Draco and KTX2 decoding
   * happen after the last byte lands and take seconds on a big bake, so the
   * number is cleared when the scene is actually published rather than when
   * the transfer finishes. A bar that sat at 100% over an empty canvas would
   * be describing the wrong thing.
   */
  modelProgress: number | null;
  setModelProgress: (progress: number | null) => void;

  /** What actually came out of the GLB. Published so the Scene step can say
   *  "12 clips playing" rather than leaving the author to guess whether a
   *  still-looking model has no animation or a broken mixer. */
  modelStats: { clips: number; meshes: number } | null;
  setModelStats: (stats: ViewerState["modelStats"]) => void;

  mode: ViewerMode;
  setMode: (mode: ViewerMode) => void;

  selection: Selection;
  select: (selection: Selection) => void;

  /** Drag the selected gizmo in the viewport. Off by default: an always-on
   *  transform gizmo swallows the orbit drag people reach for first. */
  gizmo: boolean;
  setGizmo: (on: boolean) => void;

  /** Marker radius in world units. The terminal is ~2 km across and authored
   *  1:1 in metres, so there is no size that reads at both the dollhouse
   *  vantage and standing on the quay — hence a knob rather than a constant. */
  markerScale: number;
  setMarkerScale: (n: number) => void;

  showLayouts: boolean;
  showHotspots: boolean;
  showSceneCameras: boolean;
  showGrid: boolean;
  toggle: (key: "showLayouts" | "showHotspots" | "showSceneCameras" | "showGrid") => void;

  /** The orbit camera's pose right now, republished as it settles. What "Set
   *  from view" reads. */
  livePose: CameraPose;
  publishPose: (pose: CameraPose) => void;

  /**
   * A pending "put the camera here" request, consumed once by the controls.
   *
   * A counter rather than a boolean flag because flying to the SAME pose twice
   * in a row is a real action (dial a value, press preview, dial again, press
   * preview) and a value-equal write would notify nobody.
   */
  flyRequest: { pose: CameraPose; nonce: number } | null;
  requestFly: (pose: CameraPose) => void;
  clearFly: () => void;

  /** Raised by "frame the model" and by loading a model. */
  frameRequest: number;
  requestFrame: () => void;
};

const IDENTITY_POSE: CameraPose = { position: [0, 0, 0], rotation: [0, 0, 0] };

let nonce = 0;

export const useViewerStore = create<ViewerState>()((set, get) => ({
  model: { kind: "none" },
  setModel: (next) => {
    const current = get().model;
    if (current.kind === "file") URL.revokeObjectURL(current.url);
    set({
      model: next,
      modelError: null,
      bounds: null,
      modelStats: null,
      // Straight to 0 rather than null: the loader has not reported yet, but
      // the load HAS started, and the overlay is what says so.
      modelProgress: next.kind === "none" ? null : 0,
    });
  },
  modelError: null,
  setModelError: (modelError) => set({ modelError }),

  bounds: null,
  setBounds: (bounds) => set({ bounds }),

  modelProgress: null,
  setModelProgress: (modelProgress) => set({ modelProgress }),

  modelStats: null,
  setModelStats: (modelStats) => set({ modelStats }),

  mode: "orbit",
  setMode: (mode) => set({ mode }),

  selection: { kind: "none" },
  select: (selection) => set({ selection }),

  gizmo: false,
  setGizmo: (gizmo) => set({ gizmo }),

  markerScale: 8,
  setMarkerScale: (markerScale) => set({ markerScale }),

  showLayouts: true,
  showHotspots: true,
  showSceneCameras: true,
  showGrid: false,
  toggle: (key) => set({ [key]: !get()[key] } as Partial<ViewerState>),

  livePose: IDENTITY_POSE,
  publishPose: (livePose) => set({ livePose }),

  flyRequest: null,
  requestFly: (pose) => set({ flyRequest: { pose, nonce: ++nonce } }),
  clearFly: () => set({ flyRequest: null }),

  frameRequest: 0,
  requestFrame: () => set({ frameRequest: get().frameRequest + 1 }),
}));

/** Centre of the loaded model, or the origin. Used for the default orbit
 *  pivot and as the focus fallback when a view ray misses everything. */
export function boundsCentre(b: ViewerState["bounds"]): THREE.Vector3 {
  if (!b) return new THREE.Vector3();
  return new THREE.Vector3(
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  );
}

/** Longest edge of the model's box — the scale everything else is derived
 *  from (grid size, default camera distance, near/far). */
export function boundsSpan(b: ViewerState["bounds"]): number {
  if (!b) return 100;
  return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) || 100;
}
