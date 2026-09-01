"use client";

/**
 * The single JSON blob the debug panel exports — everything the three stores
 * are driving, shaped so each top-level key is the `site.json` path it goes
 * back into.
 *
 * The point of it being ONE object is that a look is all three at once. Sun
 * bearing, sun intensity and exposure trade against each other constantly while
 * dialling, so a session that ends with three separate readouts to transcribe
 * ends with two of them stale.
 *
 * Read imperatively from `getState` rather than through hooks: the caller is a
 * Leva button, which fires outside React's render.
 */

import { useGradeStore } from "@/shared/stores/grade-store";
import { useLightsStore } from "@/shared/stores/lights-store";
import { SKY_MODE, useSkyStore } from "@/terminal/stores/sky-store";
import type { ResolvedLights } from "@/shared/types";

/** Fields the SKY derives while the dome is on, so a value pasted back into
 *  `scene.lights` for one of them is ignored at runtime (`envOverride` is
 *  merged over the config — see SceneLights). They stay in the export because
 *  they are a true record of what was rendered. */
export const SKY_DERIVED: readonly (keyof ResolvedLights)[] = [
  "sunDirection",
  "sunColor",
  "ambientColor",
  "hemiSkyColor",
  "hemiGroundColor",
];

/** Rounded on the way out, not on the way in: the sliders already step in
 *  useful increments, and it is float noise from `t`-derived colours and angles
 *  that would otherwise put `0.5500000000000001` in a config file. */
const r = (n: number, d = 4) => Number(n.toFixed(d));

export function buildDebugJson(): string {
  const s = useSkyStore.getState();
  const g = useGradeStore.getState();
  const resolved = useLightsStore.getState().resolved;

  const sky: Record<string, unknown> = {
    mode: SKY_MODE,
    t: r(s.t, 3),
    clouds: s.clouds,
  };
  // Omitted entirely while the sun is on the arc — an absent `sun` block is
  // what "follow the time of day" means, and writing one out that merely
  // repeats the arc would freeze the sun the next time `t` is authored.
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
      "// paste each key at its site.json path": {
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
