"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fogRange, type StreamingConfig } from "@/streaming/config";
import { SKY_HORIZON } from "./sky/palette";

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
 * `<site>.json › stream.fog.color` to pin it to a fixed hex instead.
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
    if (scene.fog !== fog) scene.fog = fog;
    ours.current = fog;
    // NO CLEANUP HERE. It used to null `ours.current`, which defeated the reuse
    // directly above: a band retune ran the cleanup first, so the next pass
    // found no Fog to reuse, built a new object, and three marked every material
    // in the scene for recompile. That is the blink a second or two after the
    // blackout lifts — the dollhouse authors fog off and the ground authors it
    // on, so entering first person swapped the object exactly once, mid-view.
    // Detaching belongs to unmount, below.
  }, [scene, range?.near, range?.far, authored]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (scene.fog === ours.current) scene.fog = null;
      ours.current = null;
    },
    [scene],
  );

  useFrame(() => {
    if (authored) return;
    const fog = ours.current;
    if (!fog || scene.fog !== fog) return;
    // The SKY's horizon colour, not `scene.background`. SkyDome eases the
    // background black -> horizon across its fade, so sampling it made the fog
    // BLACK for the first second or two and then drift up to sky colour — read
    // as "the fog arrives late". The dome publishes the horizon it is actually
    // drawing, so this matches where the two meet from the first frame.
    if (SKY_HORIZON.isSet) {
      fog.color.copy(SKY_HORIZON.color);
      return;
    }
    // Sites with no dome (sky.mode "off") keep the old rule.
    const bg = scene.background;
    if (bg instanceof THREE.Color) fog.color.copy(bg);
  });

  return null;
}
