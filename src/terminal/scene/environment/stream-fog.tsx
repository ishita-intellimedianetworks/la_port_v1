"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fogRange, type StreamingConfig } from "@/streaming/config";

/**
 * StreamFog — the reason the streamed download radius can be small.
 *
 * Without fog the unload boundary is a hard wall: geometry is fully saturated
 * right up to it and then is simply absent, so the eye reads the cut and the
 * only cure is loading more world. With fog, chunks dissolve into the backdrop
 * before they reach the boundary, so the radius can come down a long way at the
 * same PERCEIVED view distance. Fog is the cheap substitute for loaded
 * megabytes.
 *
 * The COLOUR is not authored anywhere. It is read from the live
 * `scene.background` every frame, which `BackgroundFade` eases between the
 * dollhouse black and the first-person sky blue over 1.6 s — so the fog and the
 * sky it dissolves into can never disagree, not even mid-transition. Any
 * hardcoded value would show a band where the two meet during that fade.
 *
 * The RANGE comes from the active streaming config and always ends at the
 * unload radius, so it retunes itself whenever the bands move (`fogRange`).
 * Mounting this with a config whose `fog.enabled` is false — the dollhouse,
 * which loads the whole model and has no boundary to hide — removes the fog.
 */
export default function StreamFog({ config }: { config: StreamingConfig }) {
  const scene = useThree((s) => s.scene);
  const range = fogRange(config);

  useEffect(() => {
    if (!range) {
      scene.fog = null;
      return;
    }
    // Reuse the existing Fog when there is one: replacing the object marks every
    // material in the scene for recompile, and the range changes on every view
    // swap.
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(0x000000);
    fog.near = range.near;
    fog.far = range.far;
    scene.fog = fog;
    return () => {
      if (scene.fog === fog) scene.fog = null;
    };
  }, [scene, range?.near, range?.far]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const fog = scene.fog;
    if (!(fog instanceof THREE.Fog)) return;
    const bg = scene.background;
    // Only a Color background is something to match. Inside an interior the
    // background is the HDR texture, and there is no streamed fog there anyway.
    if (bg instanceof THREE.Color) fog.color.copy(bg);
  });

  return null;
}
