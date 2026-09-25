"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { streamReach } from "@/streaming/reach";
import { useVrBridge } from "./bridge";

export const VR_FOG = {
  floorFraction: 0.75,
  fallbackMetres: 600,
  nearFraction: 0.45,
  staleMs: 2000,
  closePerSecond: 1.5,
  openMetresPerSecond: 25,
  farStepMetres: 25,
  farMargin: 1.05,
  color: "#a9b8c6",
  dollhouseNear: 1.5,
  firstPersonNear: 0.25,
} as const;

type Saved = { near: number; far: number; wroteNear: number; wroteFar: number };

function setRange(fog: THREE.Fog, far: number, saved: Saved | undefined) {
  fog.far = far;
  fog.near = far * VR_FOG.nearFraction;
  if (saved) {
    saved.wroteNear = fog.near;
    saved.wroteFar = fog.far;
  }
}

export function VrFog() {
  const { view } = useVrBridge();
  const get = useThree((s) => s.get);
  const own = useRef<THREE.Fog | null>(null);
  const touched = useRef(new Map<THREE.Fog, Saved>());
  const cameraFar = useRef<number | null>(null);
  const cameraNear = useRef<number | null>(null);
  const current = useRef<number | null>(null);
  const lastColor = useRef(new THREE.Color(VR_FOG.color));

  const restore = useRef(() => {});
  useEffect(() => {
    restore.current = () => {
      for (const [fog, saved] of touched.current) {
        if (fog.near !== saved.wroteNear || fog.far !== saved.wroteFar) continue;
        fog.near = saved.near;
        fog.far = saved.far;
      }
      touched.current.clear();
      const { scene, camera: cam } = get();
      if (own.current && scene.fog === own.current) scene.fog = null;
      own.current = null;
      const camera = cam as THREE.PerspectiveCamera;
      if (cameraFar.current !== null || cameraNear.current !== null) {
        if (cameraFar.current !== null) camera.far = cameraFar.current;
        if (cameraNear.current !== null) camera.near = cameraNear.current;
        camera.updateProjectionMatrix();
      }
      cameraFar.current = null;
      cameraNear.current = null;
      current.current = null;
    };
    return () => restore.current();
  }, [get]);

  const walking = view === "firstPerson";
  useEffect(() => {
    if (!walking) restore.current();
  }, [walking]);

  useFrame((state, delta) => {
    const lens = state.camera as THREE.PerspectiveCamera;
    if (cameraNear.current === null) cameraNear.current = lens.near;
    lens.near = Math.max(cameraNear.current, walking ? VR_FOG.firstPersonNear : VR_FOG.dollhouseNear);
    if (!walking) return;
    const dt = Math.min(delta, 0.1);
    const scene = state.scene;

    let fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    if (fog && fog !== own.current) {
      const saved = touched.current.get(fog);
      if (!saved) {
        touched.current.set(fog, { near: fog.near, far: fog.far, wroteNear: fog.near, wroteFar: fog.far });
      } else if (fog.near !== saved.wroteNear || fog.far !== saved.wroteFar) {
        saved.near = fog.near;
        saved.far = fog.far;
      }
      lastColor.current.copy(fog.color);
    }
    if (!fog) {
      own.current ??= new THREE.Fog(lastColor.current.getHex());
      fog = own.current;
      if (scene.background instanceof THREE.Color) fog.color.copy(scene.background);
      else fog.color.copy(lastColor.current);
      scene.fog = fog;
    }

    const ceiling = touched.current.get(fog)?.far ?? VR_FOG.fallbackMetres;
    const fresh = performance.now() - streamReach.at < VR_FOG.staleMs;
    const reach = fresh ? streamReach.metres : ceiling;
    const target = THREE.MathUtils.clamp(reach, ceiling * VR_FOG.floorFraction, ceiling);

    const prev = current.current ?? target;
    const next =
      target < prev
        ? prev + (target - prev) * Math.min(1, dt * VR_FOG.closePerSecond)
        : Math.min(target, prev + VR_FOG.openMetresPerSecond * dt);
    current.current = next;

    setRange(fog, next, touched.current.get(fog));

    const camera = state.camera as THREE.PerspectiveCamera;
    if (cameraFar.current === null) cameraFar.current = camera.far;
    const far =
      Math.ceil((next * VR_FOG.farMargin) / VR_FOG.farStepMetres) * VR_FOG.farStepMetres;
    camera.far = Math.min(cameraFar.current, far);
  });

  return null;
}
