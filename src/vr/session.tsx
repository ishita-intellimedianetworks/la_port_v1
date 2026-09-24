"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { XR, useXR } from "@react-three/xr";
import * as THREE from "three";
import { useVrBridge } from "./bridge";
import { VrHud } from "./hud";
import { VrRig } from "./rig";
import { exitVr, xrStore } from "./xr-store";

const FADE_PER_SECOND = 4;
const _head = new THREE.Vector3();

function Blackout() {
  const { fadeVisible } = useVrBridge();
  const shell = useRef<THREE.Mesh>(null);
  const opacity = useRef(0);

  useFrame((state, delta) => {
    const mesh = shell.current;
    if (!mesh) return;
    const target = fadeVisible ? 1 : 0;
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

function InSession() {
  const presenting = useXR((s) => s.session != null);
  if (!presenting) return null;
  return (
    <>
      <VrRig />
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
