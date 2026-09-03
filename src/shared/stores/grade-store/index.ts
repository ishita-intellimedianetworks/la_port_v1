import type { Site } from "@/config";
import { createSeededStore } from "@/shared/stores/create-store";

/**
 * The live colour grade, so the debug panel and the renderer look at ONE set of
 * values. Same arrangement as `sky-store`: the active model's `world.grade` is
 * the seed, not the truth — the `?debug=true` panel moves these without an
 * edit-reload cycle, and whatever is settled on gets pasted back into THAT
 * model's file.
 *
 * It lives in `shared/` rather than `terminal/` because the thing that applies
 * it is `shared/canvas/canvas-with-wrapper`, which every view mounts. Its seed
 * is per model, so it is created by the tree's root rather than at import —
 * see `createSeededStore`.
 *
 * TWO MECHANISMS, and the split is the whole design (see the schema note):
 * `exposure` is a renderer uniform applied in HDR before tone mapping, while
 * `brightness`/`contrast`/`saturation` are a CSS filter over the finished 8-bit
 * image. Exposure is free and keeps its highlights; the other three cost a
 * full-screen composite pass and can band. Hence `filterCss` below returning
 * `undefined` when they are all neutral — the default config must cost nothing.
 */

export type GradeValues = {
  /** Multiplier, 1 = untouched. Read by the renderer, before tone mapping. */
  exposure: number;
  /** Offsets, 0 = untouched. The CSS filter takes `1 + n`. */
  brightness: number;
  contrast: number;
  saturation: number;
};

export type GradeState = GradeValues & {
  /** What the page LOADED with, so the panel's reset button can name it. */
  seed: GradeValues;
  set: (patch: Partial<GradeValues>) => void;
  /** Back to whatever this model's file authored. */
  reset: () => void;
};

function seedFor(site: Site): GradeValues {
  const g = site.scene.world.grade;
  return {
    exposure: g?.exposure ?? 1,
    brightness: g?.brightness ?? 0,
    contrast: g?.contrast ?? 0,
    saturation: g?.saturation ?? 0,
  };
}

export const useGradeStore = createSeededStore<GradeState, Site>("grade-store", (site) => {
  const seed = seedFor(site);
  return (set) => ({
    ...seed,
    seed,
    set: (patch) => set(patch),
    reset: () => set({ ...seed }),
  });
});

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
