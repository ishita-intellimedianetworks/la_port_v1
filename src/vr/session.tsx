"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { XR, useXR } from "@react-three/xr";
import * as THREE from "three";
import { useProgressStore } from "@/shared/stores/progress-store";
import { streamReach } from "./engine/stream";
import { useVrBridge } from "./bridge";
import { VrFog } from "./fog";
import { VrHud } from "./hud";
import { VrMarkers } from "./markers";
import { VrNoShadows } from "./shadows";
import { VrRig } from "./rig";
import { exitVr, xrStore } from "./xr-store";
import { LoadingRing } from "./loading-ring";

const FADE_PER_SECOND = 4;
const BEFORE_SCENE = -1;
const _head = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

const SHELL = {
  renderOrder: 100000,
  nearMultiple: 2,
  minRadius: 0.5,
  labelFrom: 0.95,
} as const;

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
  const [label, setLabel] = useState(false);

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
    state.camera.matrix.decompose(_head, _quat, _scale);
    mesh.position.copy(_head);
    const near = (state.camera as THREE.PerspectiveCamera).near ?? 0.1;
    mesh.scale.setScalar(Math.max(SHELL.minRadius, near * SHELL.nearMultiple));
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity.current;
    mesh.visible = opacity.current > 0.001;
    const showLabel = opacity.current >= SHELL.labelFrom && !!settle.current;
    if (showLabel !== label) setLabel(showLabel);
  });

  return (
    <>
    <mesh ref={shell} renderOrder={SHELL.renderOrder} raycast={() => null} frustumCulled={false} visible={false}>
      <sphereGeometry args={[1, 16, 12]} />
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
    {label && <LoadingRing />}
    </>
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
  if (!presenting) return null;
  return (
    <>
      <HeadPose />
      <VrRig />
      <VrFog />
      <VrHud />
      <VrMarkers />
      <VrNoShadows />
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
