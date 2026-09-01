"use client";

/**
 * Two keys `site.json` actually carries that `config/schema.ts` does not
 * declare, given types here so the studio can edit them without `any`.
 *
 * `sky.lights.envRotation` is the live example: the file sets it to 39, the
 * runtime honours it (`SceneLights` reads `envRotation` off the merged set),
 * and the schema's `sky.lights` is `Partial<Omit<SceneConfig["lights"], …>>` —
 * a type built from a block that never listed `envRotation` in the first place.
 * The JSON is imported through an `as unknown as SiteConfig` cast, so nothing
 * ever flagged it.
 *
 * Widening here rather than editing `schema.ts` keeps this branch off the
 * runtime's type surface: the studio is additive, and a schema change would
 * ripple into every existing reader. If the mismatch is fixed upstream these
 * aliases become redundant and can go.
 */

import type { SiteConfig } from "@/config/schema";

/** `sky.lights` as authored — the schema's set plus the HDRI yaw. */
export type SkyLights = NonNullable<NonNullable<SiteConfig["sky"]>["lights"]> & {
  /** Yaw applied to the HDRI, in DEGREES. Lines the photographed sun in the
   *  env map up with the procedural one. See `LightsConfig.envRotation`. */
  envRotation?: number;
};

export function skyLights(site: SiteConfig): SkyLights {
  return (site.sky?.lights ?? {}) as SkyLights;
}

/** The `sky` block with the widened `lights`. */
export type SkyBlock = Omit<NonNullable<SiteConfig["sky"]>, "lights"> & { lights?: SkyLights };
