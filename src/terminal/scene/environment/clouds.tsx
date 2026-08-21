'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/shared/stores/world-store';

/**
 * Clouds — four drifting billboard clouds ported from the reference exterior.
 * The whole layer is parented under a group scaled + centred to the active
 * model's bounds (world-store), so the clouds authored for a ~hundreds-of-units
 * scene sit correctly in the sky of our very-large-unit models.
 *
 * Decoupled from the reference's reveal/progress gating — they're simply always
 * visible at their resting opacity.
 */

// Preload the cloud texture at module load so the FIRST first-person entry
// (where <Clouds> first mounts) doesn't suspend the canvas — that Suspense gap
// blanked the whole scene to black for a frame on dollhouse → first-person.
useTexture.preload('/cloud.png');

const WIND_SPEED = 1;
const BASE_OPACITY = [0.6, 0.52, 0.48, 0.5] as const;
// Reference clouds were authored within roughly ±550 around a scene of this
// scale; we scale the whole layer by radius / REF_SCALE to match our model.
const REF_SCALE = 300;

// Clouds drift in +x and wrap from +WRAP_EDGE back to -WRAP_EDGE. The wrap is an
// instant teleport across the sky, so we fade each cloud's opacity to 0 over the
// last FADE_BAND units before the edge — the teleport then happens while the
// cloud is invisible, and it fades back in after wrapping. Without this the
// cloud visibly "disappears" the instant it hits the edge.
const WRAP_EDGE = 550;
const FADE_BAND = 200;

// Mount fade: the cloud layer only mounts on the dollhouse → first-person
// switch — ease it in alongside the Sky dome instead of popping.
const FADE_IN_SEC = 1.5;

// 0 at the wrap edge, ramping to 1 once FADE_BAND inside it (both sides).
const edgeFade = (x: number) =>
  THREE.MathUtils.clamp((WRAP_EDGE - Math.abs(x)) / FADE_BAND, 0, 1);

export default function Clouds() {
  const texture = useTexture('/cloud.png');
  const bounds = useWorldStore((s) => s.bounds);

  const c1 = useRef<THREE.Group>(null);
  const c2 = useRef<THREE.Group>(null);
  const c3 = useRef<THREE.Group>(null);
  const c4 = useRef<THREE.Group>(null);

  const m1 = useRef<THREE.MeshStandardMaterial>(null);
  const m2 = useRef<THREE.MeshStandardMaterial>(null);
  const m3 = useRef<THREE.MeshStandardMaterial>(null);
  const m4 = useRef<THREE.MeshStandardMaterial>(null);

  const fadeRef = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    if (fadeRef.current < 1) {
      fadeRef.current = Math.min(1, fadeRef.current + delta / FADE_IN_SEC);
    }
    const fk = fadeRef.current;
    const fadeK = fk * fk * (3 - 2 * fk); // smoothstep ease-in
    const drift = (
      g: THREE.Group | null,
      mat: THREE.MeshStandardMaterial | null,
      i: number,
      speed: number,
      baseY: number,
      amp: number,
      phase: number,
    ) => {
      if (!g) return;
      g.position.x += delta * speed * WIND_SPEED;
      if (g.position.x > WRAP_EDGE) g.position.x = -WRAP_EDGE;
      g.position.y = baseY + Math.sin(t / phase) * amp;
      // Fade out near the wrap edge so the teleport is never seen; fadeK
      // eases the whole layer in after mount (dollhouse → first-person).
      if (mat) mat.opacity = BASE_OPACITY[i] * edgeFade(g.position.x) * fadeK;
    };
    drift(c1.current, m1.current, 0, 7, 140, 5, 9);
    drift(c2.current, m2.current, 1, 5, 115, 6, 7);
    drift(c3.current, m3.current, 2, 9, 155, 4, 11);
    drift(c4.current, m4.current, 3, 6, 128, 5, 8);
  });

  if (!bounds) return null;
  const s = Math.max(bounds.radius / REF_SCALE, 0.0001);

  const cloudMat = (
    i: number,
    ref: React.RefObject<THREE.MeshStandardMaterial | null>,
  ) => (
    <meshStandardMaterial
      ref={ref}
      map={texture}
      alphaMap={texture}
      emissiveMap={texture}
      color="#ffffff"
      emissive="#ffffff"
      emissiveIntensity={0.7}
      alphaTest={0.01}
      opacity={0} // driven per-frame: BASE_OPACITY × edgeFade × mount fade
      transparent
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );

  return (
    <group position={bounds.center} scale={s}>
      <Billboard ref={c1} position={[0, 140, 280]} follow>
        <mesh scale={[460, 150, 1]}>
          <planeGeometry />
          {cloudMat(0, m1)}
        </mesh>
      </Billboard>
      <Billboard ref={c2} position={[-320, 115, 100]} follow>
        <mesh scale={[-400, 130, 1]}>
          <planeGeometry />
          {cloudMat(1, m2)}
        </mesh>
      </Billboard>
      <Billboard ref={c3} position={[-150, 155, -300]} follow>
        <mesh scale={[500, 155, 1]}>
          <planeGeometry />
          {cloudMat(2, m3)}
        </mesh>
      </Billboard>
      <Billboard ref={c4} position={[260, 128, -200]} follow>
        <mesh scale={[520, 140, 1]}>
          <planeGeometry />
          {cloudMat(3, m4)}
        </mesh>
      </Billboard>
    </group>
  );
}
