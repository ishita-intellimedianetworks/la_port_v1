"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { poseForCamera } from "@/config";
import { useSite } from "@/config/context";
import type { Vec3 } from "@/config/schema";
import { anchorTargetFor } from "../../overlay/debug-panel/anchor-json";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { useDebugStore } from "../../stores/debug-store";

const ANCHOR_COLOR = "#ffd60a";
const CAMERA_COLOR = "#0a84ff";
const SIGHT_COLOR = "#ffffff";

const AXIS_LEN = 6;
const FORWARD_LEN = 12;
const RENDER_ORDER = 40;

function segments(pairs: [Vec3, Vec3][]): THREE.BufferGeometry {
  const out = new Float32Array(pairs.length * 6);
  pairs.forEach(([a, b], i) => {
    out.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  return g;
}

export function DebugAnchorHelper() {
  const show = useDebugStore((s) => s.showAnchorHelper);
  const draft = useDebugStore((s) => s.anchorDraft);
  const site = useSite();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);

  const target = useMemo(
    () => anchorTargetFor(site, selectedHotspotId ?? openHotspotId),
    [site, selectedHotspotId, openHotspotId],
  );

  const anchor: Vec3 | null = target
    ? draft && draft.id === target.id
      ? draft.position
      : target.position
    : null;

  const anchorLines = useMemo(() => {
    if (!anchor) return null;
    const [x, y, z] = anchor;
    return segments([
      [[x - AXIS_LEN, y, z], [x + AXIS_LEN, y, z]],
      [[x, y - AXIS_LEN, z], [x, y + AXIS_LEN, z]],
      [[x, y, z - AXIS_LEN], [x, y, z + AXIS_LEN]],
      [[x, y, z], [x, 0, z]],
    ]);
  }, [anchor]);

  const cameraLines = useMemo(() => {
    if (!anchor || !target?.camera) return null;
    const c = target.camera.position;
    const [pitch, yaw] = poseForCamera(target.camera).rotation;
    const f: Vec3 = [
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    return segments([
      [c, [c[0] + f[0] * FORWARD_LEN, c[1] + f[1] * FORWARD_LEN, c[2] + f[2] * FORWARD_LEN]],
      [[c[0] - 2, c[1], c[2]], [c[0] + 2, c[1], c[2]]],
      [[c[0], c[1] - 2, c[2]], [c[0], c[1] + 2, c[2]]],
      [[c[0], c[1], c[2] - 2], [c[0], c[1], c[2] + 2]],
    ]);
  }, [anchor, target]);

  const sightLine = useMemo(() => {
    if (!anchor || !target?.camera) return null;
    return segments([[target.camera.position, anchor]]);
  }, [anchor, target]);

  const dispose = useMemo(
    () => [anchorLines, cameraLines, sightLine].filter(Boolean) as THREE.BufferGeometry[],
    [anchorLines, cameraLines, sightLine],
  );
  useMemo(() => () => dispose.forEach((g) => g.dispose()), [dispose]);

  if (!show || !anchor) return null;

  return (
    <group renderOrder={RENDER_ORDER}>
      <mesh position={anchor} renderOrder={RENDER_ORDER} raycast={() => null}>
        <octahedronGeometry args={[1.6, 0]} />
        <meshBasicMaterial
          color={ANCHOR_COLOR}
          wireframe
          depthTest={false}
          depthWrite={false}
          transparent
        />
      </mesh>

      {anchorLines && (
        <lineSegments geometry={anchorLines} renderOrder={RENDER_ORDER} raycast={() => null}>
          <lineBasicMaterial color={ANCHOR_COLOR} depthTest={false} depthWrite={false} transparent />
        </lineSegments>
      )}

      {cameraLines && (
        <lineSegments geometry={cameraLines} renderOrder={RENDER_ORDER} raycast={() => null}>
          <lineBasicMaterial color={CAMERA_COLOR} depthTest={false} depthWrite={false} transparent />
        </lineSegments>
      )}

      {sightLine && (
        <lineSegments geometry={sightLine} renderOrder={RENDER_ORDER} raycast={() => null}>
          <lineBasicMaterial
            color={SIGHT_COLOR}
            depthTest={false}
            depthWrite={false}
            transparent
            opacity={0.45}
          />
        </lineSegments>
      )}
    </group>
  );
}

export default DebugAnchorHelper;
