"use client";

import { useMemo } from "react";
import SceneLights from "./scene-lights";
import Clouds from "./clouds";
import BackgroundFade from "./background-fade";
import SkyDome from "./sky/sky-dome";
import { lightingForT } from "./sky/palette";
import { useSite } from "@/config/context";
import { useSkyStore } from "@/terminal-v5/stores/sky-store";
import { useCameraAloft } from "../hooks/use-stream-config-for-camera";
import { useLightsStore } from "@/shared/stores/lights-store";
import type { LightsConfig, ResolvedLights } from "@/shared/types";

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
  const skyLights = useSite().scene.sky?.lights;
  const cloudsHidden = useLightsStore((s) => s.cloudsHidden);
  const skyVisible = showEnvMap && !cloudsHidden;
  // Which sky THIS model asked for — the seed is per site file now, so it is
  // read off the store rather than off a module constant.
  const skyMode = useSkyStore((s) => s.mode);
  const t = useSkyStore((s) => s.t);
  const sunUnlinked = useSkyStore((s) => s.sunUnlinked);
  const sunAzimuth = useSkyStore((s) => s.sunAzimuth);
  const sunElevation = useSkyStore((s) => s.sunElevation);

  // Up at a `layouts[]` framing camera (54–412 m). Same authored thresholds the
  // streamer swaps its bands on — one answer to "how high is the camera".
  const aloft = useCameraAloft();

  const envOverride = useMemo<Partial<ResolvedLights> | undefined>(() => {
    if (skyMode === "off") return undefined;
    const aim = sunUnlinked
      ? {
          azimuth: (sunAzimuth * Math.PI) / 180,
          elevation: (sunElevation * Math.PI) / 180,
        }
      : null;
    return { ...lightingForT(t, aim), ...skyLights };
  }, [skyMode, skyLights, t, sunUnlinked, sunAzimuth, sunElevation]);

  return (
    <>
      <SceneLights
        shadows={shadows}
        lights={lights}
        venueKey={venueKey}
        interior={interior}
        follow={showEnvMap && !aloft}
        followRadius={followRadius}
        envOverride={envOverride}
      />
      {!interior &&
        (skyMode === "off" ? (
          <BackgroundFade sky={skyVisible} />
        ) : (
          <SkyDome sky={skyVisible} />
        ))}
      {skyMode === "off" && showEnvMap && !interior && !cloudsHidden && <Clouds />}
    </>
  );
}
