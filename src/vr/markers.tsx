"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import * as THREE from "three";
import { useSite } from "@/config/context";
import type { HotspotConfig } from "@/config/schema";
import { useVrBridge } from "./bridge";
import { Glass } from "./ui/primitives";
import { VrText } from "./ui/text";
import { COLOR, RENDER_ORDER } from "./ui/tokens";

const MARKER = {
  scale: 0.65,
  scanSeconds: 0.5,
  matchUnits: 0.5,
  core: "hotspot_core",
  collider: "hotspot_hover_collider",
} as const;

const LABEL = {
  pixelPerMetre: 0.0014,
  liftPerMetre: 0.035,
  fontSize: 22,
  paddingX: 18,
  paddingY: 9,
} as const;

interface Marker {
  sizer: THREE.Object3D;
  collider: THREE.Object3D;
  radius: number;
  title: string;
}

const _at = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _up = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _unused = new THREE.Vector3();
const _ray = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function titleAt(hotspots: HotspotConfig[], at: THREE.Vector3): string | null {
  let best: string | null = null;
  let bestDist: number = MARKER.matchUnits;
  for (const h of hotspots) {
    const d = Math.hypot(h.position[0] - at.x, h.position[1] - at.y, h.position[2] - at.z);
    if (d < bestDist) {
      bestDist = d;
      best = h.name;
    }
  }
  return best;
}

function scanMarkers(scene: THREE.Scene, hotspots: HotspotConfig[]): Marker[] {
  const found: Marker[] = [];
  scene.traverse((node) => {
    if (node.name !== MARKER.core || !node.parent) return;
    const sizer = node.parent;
    const collider = sizer.getObjectByName(MARKER.collider);
    const anchor = sizer.parent;
    if (!collider || !anchor) return;
    anchor.getWorldPosition(_at);
    const geometry = (node as THREE.Mesh).geometry as THREE.SphereGeometry | undefined;
    found.push({
      sizer,
      collider,
      radius: geometry?.parameters?.radius ?? 0.6,
      title: titleAt(hotspots, _at) ?? "",
    });
  });
  return found;
}

function shrinkBeforeRender(scene: THREE.Scene, markers: { current: Marker[] }): () => void {
  const previous = scene.onBeforeRender;
  const applied = new WeakMap<THREE.Object3D, number>();
  scene.onBeforeRender = function (...args) {
    previous.apply(this, args);
    for (const { sizer } of markers.current) {
      if (!sizer.parent) continue;
      const current = sizer.scale.x;
      if (applied.get(sizer) === current) continue;
      const next = current * MARKER.scale;
      sizer.scale.setScalar(next);
      applied.set(sizer, next);
      sizer.updateMatrixWorld(true);
    }
  };
  return () => {
    scene.onBeforeRender = previous;
  };
}

function pointedMarker(
  gl: THREE.WebGLRenderer,
  frame: XRFrame | undefined,
  markers: Marker[],
): Marker | null {
  const session = gl.xr.getSession();
  const space = gl.xr.getReferenceSpace();
  if (!session || !space || !frame || markers.length === 0) return null;
  const colliders = markers.filter((m) => m.sizer.parent).map((m) => m.collider);
  let best: Marker | null = null;
  let bestDist = Infinity;
  for (const source of session.inputSources) {
    if (source.targetRayMode !== "tracked-pointer") continue;
    const pose = frame.getPose(source.targetRaySpace, space);
    if (!pose) continue;
    _ray.fromArray(pose.transform.matrix);
    _at.setFromMatrixPosition(_ray);
    _dir.set(0, 0, -1).transformDirection(_ray);
    _raycaster.set(_at, _dir);
    const hit = _raycaster.intersectObjects(colliders, false)[0];
    if (!hit || hit.distance >= bestDist) continue;
    const marker = markers.find((m) => m.collider === hit.object) ?? null;
    if (!marker?.title) continue;
    bestDist = hit.distance;
    best = marker;
  }
  return best;
}

export function VrMarkers() {
  const { fadeVisible } = useVrBridge();
  const site = useSite();
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const markers = useRef<Marker[]>([]);
  const since = useRef<number>(MARKER.scanSeconds);
  const group = useRef<THREE.Group>(null);
  const [pointed, setPointed] = useState<Marker | null>(null);
  const hotspots = useRef<HotspotConfig[]>([]);

  useEffect(() => {
    hotspots.current = [...site.hotspots, ...site.securityHotspots];
  }, [site]);

  useEffect(() => shrinkBeforeRender(scene, markers), [scene]);

  useFrame((state, delta, frame?: XRFrame) => {
    since.current += delta;
    if (since.current >= MARKER.scanSeconds) {
      since.current = 0;
      markers.current = scanMarkers(scene, hotspots.current);
    }

    const hit = fadeVisible ? null : pointedMarker(gl, frame, markers.current);
    if (hit !== pointed) setPointed(hit);

    const g = group.current;
    if (!g) return;
    if (!hit) {
      g.visible = false;
      return;
    }
    state.camera.matrixWorld.decompose(_eye, _quat, _unused);
    hit.sizer.getWorldPosition(_at);
    hit.sizer.getWorldScale(_scale);
    const dist = Math.max(0.1, _eye.distanceTo(_at));
    _up.set(0, 1, 0).applyQuaternion(_quat);
    g.position.copy(_at).addScaledVector(_up, hit.radius * _scale.y + dist * LABEL.liftPerMetre);
    g.quaternion.copy(_quat);
    g.scale.setScalar(dist);
    g.visible = true;
  });

  if (!pointed) return null;

  return (
    <group ref={group} visible={false}>
      <Container
        pixelSize={LABEL.pixelPerMetre}
        anchorY="bottom"
        depthTest={false}
        renderOrder={RENDER_ORDER}
        pointerEvents="none"
        positionType="relative"
        paddingX={LABEL.paddingX}
        paddingY={LABEL.paddingY}
        borderRadius={999}
        alignItems="center"
        justifyContent="center"
      >
        <Glass radius={999} />
        <VrText fontSize={LABEL.fontSize} fontWeight="semi-bold" color={COLOR.text}>
          {pointed.title}
        </VrText>
      </Container>
    </group>
  );
}
