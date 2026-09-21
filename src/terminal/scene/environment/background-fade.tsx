"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Same blue the Sky dome used (#7fbffc) — the backdrop just became the
// canvas clear colour instead of a dome mesh.
const SKY_BLUE = new THREE.Color("#7fbffc");
const BLACK = new THREE.Color("#000000");

const FADE_SEC = 1.6;

export default function BackgroundFade({ sky }: { sky: boolean }) {
  const scene = useThree((s) => s.scene);
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
    const k = mix.current * mix.current * (3 - 2 * mix.current);
    (scene.background as THREE.Color).copy(BLACK).lerp(SKY_BLUE, k);
  });

  return null;
}
