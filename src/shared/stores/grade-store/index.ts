import { scene } from "@/config";
import { createStore } from "@/shared/stores/create-store";

/**
 * The live colour grade, so the debug panel and the renderer look at ONE set of
 * values. Same arrangement as `sky-store`: `site.json › world.grade` is the
 * seed, not the truth — the `?debug=true` panel moves these without an
 * edit-reload cycle, and whatever is settled on gets pasted back into config.
 *
 * It lives in `shared/` rather than `terminal/` because the thing that applies
 * it is `shared/canvas/canvas-with-wrapper`, which every view mounts.
 *
 * TWO MECHANISMS, and the split is the whole design (see the schema note):
 * `exposure` is a renderer uniform applied in HDR before tone mapping, while
 * `brightness`/`contrast`/`saturation` are a CSS filter over the finished 8-bit
 * image. Exposure is free and keeps its highlights; the other three cost a
 * full-screen composite pass and can band. Hence `filterCss` below returning
 * `undefined` when they are all neutral — the default config must cost nothing.
 */

const SEED = scene.world.grade;

/** What the page LOADS with. Exported so the panel's reset button can name it. */
export const GRADE_SEED = {
  exposure: SEED?.exposure ?? 1,
  brightness: SEED?.brightness ?? 0,
  contrast: SEED?.contrast ?? 0,
  saturation: SEED?.saturation ?? 0,
};

export type GradeState = {
  /** Multiplier, 1 = untouched. Read by the renderer, before tone mapping. */
  exposure: number;
  /** Offsets, 0 = untouched. The CSS filter takes `1 + n`. */
  brightness: number;
  contrast: number;
  saturation: number;
  set: (patch: Partial<Omit<GradeState, "set" | "reset">>) => void;
  /** Back to whatever `site.json` authored. */
  reset: () => void;
};

export const useGradeStore = createStore<GradeState>((set) => ({
  ...GRADE_SEED,
  set: (patch) => set(patch),
  reset: () => set({ ...GRADE_SEED }),
}));

/**
 * The `filter` value for the canvas, or `undefined` when there is nothing to do.
 *
 * Returning `undefined` rather than the identity string matters: any non-`none`
 * filter puts the canvas on its own composited layer and runs a shader over
 * every pixel each frame. `brightness(1) contrast(1) saturate(1)` looks free
 * and is not, and the seeded config is exactly that case.
 */
export function filterCss(g: { brightness: number; contrast: number; saturation: number }) {
  if (g.brightness === 0 && g.contrast === 0 && g.saturation === 0) return undefined;
  return (
    `brightness(${(1 + g.brightness).toFixed(3)}) ` +
    `contrast(${(1 + g.contrast).toFixed(3)}) ` +
    `saturate(${(1 + g.saturation).toFixed(3)})`
  );
}
