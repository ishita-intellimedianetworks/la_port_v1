"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { XR, useXR } from "@react-three/xr";
import * as THREE from "three";
import { setMarkerScale } from "@/shared/runtime/marker-scale";
import { useProgressStore } from "@/shared/stores/progress-store";
import { streamReach } from "@/streaming/reach";
import { useVrBridge } from "./bridge";
import { VrFog } from "./fog";
import { VrHud } from "./hud";
import { VrRig } from "./rig";
import { exitVr, xrStore } from "./xr-store";

const FADE_PER_SECOND = 4;
const BEFORE_SCENE = -1;
const MARKER_SCALE = 0.65;
const _head = new THREE.Vector3();

const SETTLE = {
  minMs: 400,
  maxMs: 6000,
  floor: 4,
  fraction: 0.05,
  reachMetres: 40,
  staleMs: 2000,
} as const;

function settled(): () => boolean {
  let start = -1;
  let peak = 0;
  return () => {
    const now = performance.now();
    if (start < 0) start = now;
    const n = useProgressStore.getState().streamDressing;
    if (n > peak) peak = n;
    const elapsed = now - start;
    if (elapsed < SETTLE.minMs) return false;
    if (elapsed >= SETTLE.maxMs) return true;
    const reachKnown = now - streamReach.at < SETTLE.staleMs;
    const nearDrawn = !reachKnown || streamReach.metres >= SETTLE.reachMetres;
    return nearDrawn && n <= Math.max(SETTLE.floor, peak * SETTLE.fraction);
  };
}

function Blackout() {
  const { fadeVisible } = useVrBridge();
  const shell = useRef<THREE.Mesh>(null);
  const opacity = useRef(0);
  const wasFading = useRef(false);
  const settle = useRef<(() => boolean) | null>(null);

  useFrame((state, delta) => {
    const mesh = shell.current;
    if (!mesh) return;
    if (fadeVisible) {
      wasFading.current = true;
      settle.current = null;
    } else if (wasFading.current) {
      wasFading.current = false;
      settle.current = settled();
    }
    if (settle.current?.()) settle.current = null;
    const target = fadeVisible || settle.current ? 1 : 0;
    const step = Math.min(delta, 0.1) * FADE_PER_SECOND;
    opacity.current =
      target > opacity.current
        ? Math.min(target, opacity.current + step)
        : Math.max(target, opacity.current - step);
    state.camera.matrix.decompose(_head, new THREE.Quaternion(), new THREE.Vector3());
    mesh.position.copy(_head);
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity.current;
    mesh.visible = opacity.current > 0.001;
  });

  return (
    <mesh ref={shell} renderOrder={100000} raycast={() => null} frustumCulled={false} visible={false}>
      <sphereGeometry args={[0.25, 16, 12]} />
      <meshBasicMaterial
        color="black"
        side={THREE.BackSide}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

function HeadPose() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const camera = get().camera;
    camera.matrixAutoUpdate = false;
    return () => {
      camera.matrixAutoUpdate = true;
    };
  }, [get]);

  useFrame((state, _delta, frame?: XRFrame) => {
    const space = gl.xr.getReferenceSpace();
    const pose = space ? frame?.getViewerPose(space) : undefined;
    if (!pose) return;
    const camera = state.camera;
    camera.matrix.fromArray(pose.transform.matrix);
    camera.matrixWorld.copy(camera.matrix);
    camera.matrixWorldInverse.copy(camera.matrix).invert();
  }, BEFORE_SCENE);

  return null;
}

function InSession() {
  const presenting = useXR((s) => s.session != null);
  useEffect(() => {
    if (!presenting) return;
    setMarkerScale(MARKER_SCALE);
    return () => setMarkerScale(1);
  }, [presenting]);
  if (!presenting) return null;
  return (
    <>
      <HeadPose />
      <VrRig />
      <VrFog />
      <VrHud />
      <Blackout />
    </>
  );
}

export function VrSession({ children }: { children: ReactNode }) {
  useEffect(() => exitVr, []);
  return (
    <XR store={xrStore}>
      {children}
      <InSession />
    </XR>
  );
}
