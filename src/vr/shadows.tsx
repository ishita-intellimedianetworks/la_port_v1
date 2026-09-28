"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const RECHECK_SECONDS = 1;

function switchOff(scene: THREE.Scene, off: Set<THREE.Light>) {
  scene.traverse((node) => {
    const light = node as THREE.Light;
    if (light.isLight && light.castShadow) {
      light.castShadow = false;
      off.add(light);
    }
  });
}

function restore(off: Set<THREE.Light>) {
  for (const light of off) light.castShadow = true;
  off.clear();
}

export function VrNoShadows() {
  const scene = useThree((s) => s.scene);
  const off = useRef(new Set<THREE.Light>());
  const since = useRef(RECHECK_SECONDS);

  useEffect(() => {
    const lights = off.current;
    return () => restore(lights);
  }, []);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current < RECHECK_SECONDS) return;
    since.current = 0;
    switchOff(scene, off.current);
  });

  return null;
}
