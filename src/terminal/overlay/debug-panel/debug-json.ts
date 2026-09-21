"use client";

import { useGradeStore } from "@/shared/stores/grade-store";
import { useLightsStore } from "@/shared/stores/lights-store";
import { useSkyStore } from "@/terminal/stores/sky-store";
import type { ResolvedLights } from "@/shared/types";

export const SKY_DERIVED: readonly (keyof ResolvedLights)[] = [
  "sunDirection",
  "sunColor",
  "ambientColor",
  "hemiSkyColor",
  "hemiGroundColor",
];

const r = (n: number, d = 4) => Number(n.toFixed(d));

export function buildDebugJson(): string {
  const s = useSkyStore.getState();
  const g = useGradeStore.getState();
  const resolved = useLightsStore.getState().resolved;

  const sky: Record<string, unknown> = {
    mode: s.mode,
    t: r(s.t, 3),
    clouds: s.clouds,
  };
  if (s.sunUnlinked) {
    sky.sun = { azimuth: r(s.sunAzimuth, 1), elevation: r(s.sunElevation, 1) };
  }

  const lights = resolved
    ? Object.fromEntries(
        (Object.keys(resolved) as (keyof ResolvedLights)[]).sort().map((k) => {
          const v = resolved[k];
          if (typeof v === "number") return [k, r(v, 5)];
          if (Array.isArray(v)) return [k, v.map((n) => r(n, 4))];
          return [k, v];
        }),
      )
    : null;

  return JSON.stringify(
    {
      "// paste each key at its path in this model's site file": {
        "scene.sky": "scene.sky",
        "scene.lights": "scene.lights",
        "world.grade": "world.grade",
        note: `while the sky dome is on, ${SKY_DERIVED.join(", ")} are re-derived from the palette every frame — those entries record what rendered, they are not knobs config will honour`,
      },
      "scene.sky": sky,
      "scene.lights": lights,
      "world.grade": {
        exposure: r(g.exposure, 3),
        brightness: r(g.brightness, 3),
        contrast: r(g.contrast, 3),
        saturation: r(g.saturation, 3),
      },
    },
    null,
    2,
  );
}
