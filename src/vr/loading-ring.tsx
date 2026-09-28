"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import * as THREE from "three";
import { useProgressStore } from "@/shared/stores/progress-store";
import { VrText } from "./ui/text";
import { COLOR } from "./ui/tokens";

const RING = {
  distance: 2.5,
  radius: 0.16,
  width: 0.012,
  segments: 128,
  dot: 0.014,
  spinSeconds: 1.4,
  follow: 6,
  ease: 5,
  track: 0.16,
  accent: "#2997ff",
  renderOrder: 100001,
  pixelSize: 0.0016,
  fontSize: 30,
} as const;

const _head = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _ahead = new THREE.Vector3();

function ringGeometry(): THREE.RingGeometry {
  return new THREE.RingGeometry(
    RING.radius - RING.width / 2,
    RING.radius + RING.width / 2,
    RING.segments,
    1,
    Math.PI / 2,
    Math.PI * 2,
  );
}

function overlay(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

export function LoadingRing() {
  const group = useRef<THREE.Group>(null);
  const arc = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.Mesh>(null);
  const placed = useRef(false);
  const peak = useRef(0);
  const shown = useRef(0);
  const spin = useRef(0);
  const [percent, setPercent] = useState(0);

  const track = useMemo(() => ringGeometry(), []);
  const fill = useMemo(() => ringGeometry(), []);
  const disc = useMemo(() => new THREE.CircleGeometry(RING.dot, 24), []);
  const trackMaterial = useMemo(() => overlay("#ffffff", RING.track), []);
  const fillMaterial = useMemo(() => overlay(RING.accent, 1), []);
  const dotMaterial = useMemo(() => overlay("#ffffff", 1), []);

  useEffect(
    () => () => {
      for (const g of [track, fill, disc]) g.dispose();
      for (const m of [trackMaterial, fillMaterial, dotMaterial]) m.dispose();
    },
    [track, fill, disc, trackMaterial, fillMaterial, dotMaterial],
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    state.camera.matrixWorld.decompose(_head, _quat, _scale);
    _ahead.set(0, 0, -RING.distance).applyQuaternion(_quat).add(_head);
    const k = placed.current ? Math.min(1, delta * RING.follow) : 1;
    g.position.lerp(_ahead, k);
    g.quaternion.slerp(_quat, k);
    placed.current = true;
    g.visible = true;

    const left = useProgressStore.getState().streamDressing;
    if (left > peak.current) peak.current = left;
    const target = peak.current > 0 ? 1 - left / peak.current : 0;
    shown.current = Math.max(shown.current, shown.current + (target - shown.current) * Math.min(1, delta * RING.ease));
    const frac = Math.min(1, Math.max(0, shown.current));
    const index = fill.getIndex();
    if (index) fill.setDrawRange(0, Math.floor((index.count / 6) * frac) * 6);

    spin.current = (spin.current + delta / RING.spinSeconds) % 1;
    const a = Math.PI / 2 - spin.current * Math.PI * 2;
    dot.current?.position.set(Math.cos(a) * RING.radius, Math.sin(a) * RING.radius, 0.001);

    const next = Math.round(frac * 100);
    if (next !== percent) setPercent(next);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={track} material={trackMaterial} renderOrder={RING.renderOrder} raycast={() => null} />
      <mesh
        ref={arc}
        geometry={fill}
        material={fillMaterial}
        scale={[-1, 1, 1]}
        renderOrder={RING.renderOrder + 1}
        raycast={() => null}
      />
      <mesh ref={dot} geometry={disc} material={dotMaterial} renderOrder={RING.renderOrder + 2} raycast={() => null} />
      <Container
        pixelSize={RING.pixelSize}
        depthTest={false}
        renderOrder={RING.renderOrder + 3}
        pointerEvents="none"
      >
        <VrText fontSize={RING.fontSize} fontWeight="semi-bold" color={COLOR.text}>
          {`${percent}%`}
        </VrText>
      </Container>
    </group>
  );
}
