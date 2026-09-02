"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fogRange, type StreamingConfig } from "@/streaming/config";

/**
 * StreamFog — the thing that lets the download radius be SMALL.
 *
 * Ported from LA_PORT_ADAPTIVE's `SceneFog`. Without it, `unloadDist` is a hard
 * wall: geometry is fully lit and saturated right up to the boundary and then
 * simply is not there, so the eye reads the cut instantly and the only way to
 * hide it is to load more world. With fog, chunks fade into the sky colour
 * BEFORE they reach the boundary, so nothing visibly pops and the radius can
 * come down a long way at the same perceived view distance. Fog is the cheap
 * substitute for loaded megabytes.
 *
 * The RANGE is that port, verbatim — see `fogRange()`. `far` is pinned just
 * inside the unload radius and `near` to a band edge, so the fade always ends
 * where chunks stop existing and retunes itself whenever the bands move.
 *
 * The COLOUR is the one place this diverges, and it diverges to keep the
 * original's actual rule rather than its literal value. There, fog is the sky
 * gradient's horizon stop scaled by the background intensity — because the
 * whole point is that fog and sky are the same colour where they meet, and its
 * own note warns that "any hardcoded value must match the sky at the horizon or
 * a band appears". This app's sky is not that gradient: it is a flat background
 * colour that `BackgroundFade` eases between the dollhouse black and the
 * first-person blue over 1.6 s. So the colour is read from the LIVE
 * `scene.background` every frame — the same rule, applied to the backdrop this
 * app actually has, and correct even mid-crossfade. Author
 * `site.json › stream.fog.color` to pin it to a fixed hex instead.
 */
export default function StreamFog({ config }: { config: StreamingConfig }) {
  const scene = useThree((s) => s.scene);
  const range = fogRange(config);
  const authored = config.fog.color;
  // Own the Fog we installed, so the frame loop never recolours one that
  // something else (an interior's HDR environment) put there.
  const ours = useRef<THREE.Fog | null>(null);

  useEffect(() => {
    if (!range) {
      if (scene.fog && scene.fog === ours.current) scene.fog = null;
      ours.current = null;
      return;
    }
    // Reuse the existing Fog when we already own one: replacing the object
    // marks every material in the scene for recompile, and the range changes
    // whenever the bands are retuned.
    const fog = ours.current ?? new THREE.Fog(0x000000);
    fog.near = range.near;
    fog.far = range.far;
    if (authored) fog.color.set(authored);
    scene.fog = fog;
    ours.current = fog;
    return () => {
      if (scene.fog === fog) scene.fog = null;
      if (ours.current === fog) ours.current = null;
    };
  }, [scene, range?.near, range?.far, authored]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    if (authored) return;
    const fog = ours.current;
    if (!fog || scene.fog !== fog) return;
    const bg = scene.background;
    // Only a Color background is something to match. Inside an interior the
    // background is the HDR texture, and there is no streamed fog there anyway.
    if (bg instanceof THREE.Color) fog.color.copy(bg);
  });

  return null;
}
