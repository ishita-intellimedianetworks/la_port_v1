import type { Site } from "@/config";
import { createSeededStore } from "@/shared/stores/create-store";

export type GradeValues = {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
};

export type GradeState = GradeValues & {
  seed: GradeValues;
  set: (patch: Partial<GradeValues>) => void;
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

export function filterCss(g: { brightness: number; contrast: number; saturation: number }) {
  if (g.brightness === 0 && g.contrast === 0 && g.saturation === 0) return undefined;
  return (
    `brightness(${(1 + g.brightness).toFixed(3)}) ` +
    `contrast(${(1 + g.contrast).toFixed(3)}) ` +
    `saturate(${(1 + g.saturation).toFixed(3)})`
  );
}
