"use client";

import SceneLights from "./scene-lights";
import Clouds from "./clouds";
import BackgroundFade from "./background-fade";
import { useLightsStore } from "@/shared/stores/lights-store";
import type { LightsConfig } from "@/shared/types";

/**
 * SceneEnvironment — sun + ambient + HDR image-based lighting are always on (so
 * the model is lit in every view). The sky is the canvas BACKGROUND COLOUR
 * (BackgroundFade), not a dome mesh — black in the dollhouse so the model
 * reads as an isolated object, crossfading to sky blue on the transition to
 * first-person. Drifting clouds show only in first-person (`showEnvMap`).
 *
 * Inside an apartment-interior scene (`interior`) the drifting clouds are
 * dropped — you're inside a room, so an exterior cloud layer reads as wrong.
 * The sky backdrop stays (visible through windows); only the clouds are hidden.
 */
export default function SceneEnvironment({
  showEnvMap = true,
  shadows = true,
  interior = false,
  lights,
  venueKey,
}: {
  showEnvMap?: boolean;
  shadows?: boolean;
  interior?: boolean;
  /** Per-venue lighting overrides — forwarded to SceneLights. */
  lights?: LightsConfig;
  /** Active venue id — keys the live lights store. */
  venueKey?: string;
}) {
  // Set by the /lighting dusk/night modes; false everywhere else (nothing sets it
  // on /). It hides the daytime clouds AND keeps the first-person backdrop
  // black — the v2 dusk/night sky dome fades in over black instead of the
  // day blue bleeding through underneath it.
  const cloudsHidden = useLightsStore((s) => s.cloudsHidden);
  return (
    <>
      <SceneLights shadows={shadows} lights={lights} venueKey={venueKey} interior={interior} />
      {/* Exterior backdrop = the background-colour sky + drifting clouds.
          Inside a room we drop BOTH and let the HDR environment show through
          as the background (SceneLights renders it with `background` for
          interiors) — BackgroundFade must not mount there or it would fight
          that texture. */}
      {!interior && <BackgroundFade sky={showEnvMap && !cloudsHidden} />}
      {showEnvMap && !interior && !cloudsHidden && <Clouds />}
    </>
  );
}
