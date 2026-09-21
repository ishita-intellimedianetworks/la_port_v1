"use client";

import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { type StreamingConfig } from "@/streaming/config";
import { useStreamVariant } from "@/streaming/variant";

export function useStreamConfigForCamera(
  ground: StreamingConfig,
  aerial: StreamingConfig | null,
): StreamingConfig {
  const aloft = useCameraAloft();
  return aloft && aerial ? aerial : ground;
}

export function useCameraAloft(): boolean {
  const camera = useThree((s) => s.camera);
  const at = useStreamVariant().aerialSwitch;
  const [aloft, setAloft] = useState(false);
  const world = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!at) return;
    const y = camera.getWorldPosition(world.current).y;
    // setState with an unchanged value is a no-op in React, so this costs
    // nothing on the frames — nearly all of them — where the answer is stable.
    setAloft((was) => (was ? y >= at.exitBelow : y >= at.enterAbove));
  });

  return aloft;
}
