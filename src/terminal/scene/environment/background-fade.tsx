"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Same blue the Sky dome used (#7fbffc) — the backdrop just became the
// canvas clear colour instead of a dome mesh.
const SKY_BLUE = new THREE.Color("#7fbffc");
const BLACK = new THREE.Color("#000000");

// Matches the old dome fade, riding the dollhouse → first-person fly.
const FADE_SEC = 1.6;

/**
 * BackgroundFade — eases `scene.background` between the black dollhouse
 * backdrop and the first-person sky blue. Replaces the Sky dome mesh (which
 * never read reliably against the venue models): the sky is now simply the
 * canvas background colour, crossfaded with the view-mode transition.
 *
 * Exterior floors only — interiors show the HDR itself as the background
 * (SceneLights' <Environment background>), which REPLACES scene.background
 * with a texture; this component must not fight it, so don't mount it there.
 * It also restores a Color background after returning from an interior.
 */
export default function BackgroundFade({ sky }: { sky: boolean }) {
  const scene = useThree((s) => s.scene);
  // 0 = black (dollhouse), 1 = sky blue (first person); eased toward `sky`.
  const mix = useRef(0);

  useFrame((_, delta) => {
    const target = sky ? 1 : 0;
    const step = delta / FADE_SEC;
    mix.current =
      target > mix.current
        ? Math.min(target, mix.current + step)
        : Math.max(target, mix.current - step);

    // Coming back from an interior the background is still the HDR texture —
    // swap a Color back in before writing to it.
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(0x000000);
    const k = mix.current * mix.current * (3 - 2 * mix.current); // smoothstep
    (scene.background as THREE.Color).copy(BLACK).lerp(SKY_BLUE, k);
  });

  return null;
}
