"use client";

import { useMemo } from "react";
import SceneLights from "./scene-lights";
import Clouds from "./clouds";
import BackgroundFade from "./background-fade";
import SkyDome from "./sky/sky-dome";
import { lightingForT } from "./sky/palette";
import { scene as siteScene } from "@/config";
import { SKY_MODE, useSkyStore } from "@/terminal-v3/stores/sky-store";
import { useCameraAloft } from "../hooks/use-stream-config-for-camera";
import { useLightsStore } from "@/shared/stores/lights-store";
import type { LightsConfig, ResolvedLights } from "@/shared/types";

/**
 * SceneEnvironment — sun + ambient + HDR image-based lighting are always on (so
 * the model is lit in every view). The BACKDROP has two forms, picked by
 * `site.json › sky`:
 *
 *   sky.mode "off" (or absent) — the original: the sky is the canvas BACKGROUND
 *     COLOUR (BackgroundFade), black in the dollhouse so the model reads as an
 *     isolated object, crossfading to sky blue on the way to first-person, with
 *     drifting billboard clouds on top.
 *
 *   sky.mode "dusk" / "day" — the procedural SkyDome: a real gradient with a
 *     sun and a horizon cloud band, evaluated per pixel with no texture and no
 *     post pass (see `./sky`). It fades in over black on the same curve, and it
 *     also drives the sun's DIRECTION so the model's shading and shadows agree
 *     with the sun that is visibly in the sky. The billboard cloud layer is
 *     dropped: the dome carries its own band, those sprites are lit for noon,
 *     and dropping them takes `/cloud.png` out of memory as well.
 *
 * With the dome on, time of day is LIVE — `site.json › sky` only seeds
 * `sky-store`, and the `?debug=true` panel drives it from there.
 *
 * Inside an apartment-interior scene (`interior`) the whole exterior backdrop
 * is dropped: you are inside a room, and SceneLights renders the HDR itself as
 * the background there, which nothing else may fight.
 */

const SKY = siteScene.sky;

export default function SceneEnvironment({
  showEnvMap = true,
  shadows = true,
  interior = false,
  followRadius,
  lights,
  venueKey,
}: {
  showEnvMap?: boolean;
  shadows?: boolean;
  interior?: boolean;
  /** Where the streamed world stops being visible - forwarded to SceneLights,
   *  which sizes the sun's follow square from it. */
  followRadius?: number;
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
  const skyVisible = showEnvMap && !cloudsHidden;
  const t = useSkyStore((s) => s.t);
  // Where the sun is, when the debug panel has taken it off the arc. Off
  // everywhere else, and the sun then rides the arc `t` puts it on. SkyDome is
  // handed the same two angles, so the disk and this light never diverge.
  const sunUnlinked = useSkyStore((s) => s.sunUnlinked);
  const sunAzimuth = useSkyStore((s) => s.sunAzimuth);
  const sunElevation = useSkyStore((s) => s.sunElevation);

  // Up at a `layouts[]` framing camera (54–412 m). Same authored thresholds the
  // streamer swaps its bands on — one answer to "how high is the camera".
  const aloft = useCameraAloft();

  // Lighting for the time of day, COLOURS AND ALL, taken from the same palette
  // the dome is drawn from — sun direction, sun tint, ambient tint. Nothing
  // here is a hand-picked hex sitting next to a generated sky, which is the
  // pair that drifts apart. Only the intensities are authored (`sky.lights`),
  // because the study is a shader with no scene lights and has no opinion on
  // them. It re-derives when the debug slider moves, so the sun on the model
  // tracks the sun in the sky.
  const skyLights = useMemo<Partial<ResolvedLights> | undefined>(() => {
    if (SKY_MODE === "off") return undefined;
    // Degrees at the panel (the unit anyone reads a sun angle in), radians here
    // (the unit the arc is authored in). Null keeps the sun on the arc, which is
    // every path but the debug one.
    const aim = sunUnlinked
      ? {
          azimuth: (sunAzimuth * Math.PI) / 180,
          elevation: (sunElevation * Math.PI) / 180,
        }
      : null;
    return { ...lightingForT(t, aim), ...SKY?.lights };
  }, [t, sunUnlinked, sunAzimuth, sunElevation]);

  return (
    <>
      <SceneLights
        shadows={shadows}
        lights={lights}
        venueKey={venueKey}
        interior={interior}
        // Follow is for being ON FOOT: the square tracks the camera because
        // that is where the world you can see is. A LAYOUT camera breaks that
        // assumption — it sits hundreds of metres up framing a district that
        // can be kilometres away, so a square centred under it is centred on
        // nothing, and widening it to reach the shot only spreads the same
        // 1024 texels over ~7 m each. The dollhouse's static fit is the right
        // one there: the smallest light-space square over the whole model,
        // drawn once and frozen — the same shot, ~5x finer, and no per-move
        // redraw. So follow is on foot ONLY, and an aerial camera falls back
        // to it exactly as the dollhouse does.
        follow={showEnvMap && !aloft}
        followRadius={followRadius}
        envOverride={skyLights}
      />
      {/* Exterior backdrop. Inside a room we drop it entirely and let the HDR
          environment show through as the background (SceneLights renders it
          with `background` for interiors) — neither backdrop may mount there or
          it would fight that texture. */}
      {!interior &&
        (SKY_MODE === "off" ? (
          <BackgroundFade sky={skyVisible} />
        ) : (
          <SkyDome sky={skyVisible} />
        ))}
      {SKY_MODE === "off" && showEnvMap && !interior && !cloudsHidden && <Clouds />}
    </>
  );
}
