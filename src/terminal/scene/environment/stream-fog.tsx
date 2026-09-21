"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { fogRange, type StreamingConfig } from "@/streaming/config";

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
