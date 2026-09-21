"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGLTF, Bvh } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { acquireGLTF, releaseGLTF } from "@/shared/runtime";
import { useDebugStore } from "../../../stores/debug-store";

// Room zone: one named mesh in the navmesh GLB
// Convention: mesh.name in the GLB matches the LayoutsConfig.id in scene-config
export interface RoomZone {
  id: string;
  mesh: THREE.Mesh;
  bbox: THREE.Box3;
}

export interface FloorBounds {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
}

function extractGeo(scene: THREE.Group): {
  geo: THREE.BufferGeometry;
  firstBBox: THREE.Box3;
  roomZones: RoomZone[];
} | null {
  const parts: THREE.BufferGeometry[] = [];
  const roomZones: RoomZone[] = [];
  let firstBBox: THREE.Box3 | null = null;

  scene.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      let g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      if (g.index !== null) g = g.toNonIndexed();
      if (!firstBBox) {
        g.computeBoundingBox();
        if (g.boundingBox) firstBBox = g.boundingBox.clone();
      }
      parts.push(g);

      if (mesh.name && mesh.name.trim()) {
        g.computeBoundingBox();
        if (g.boundingBox) {
          const invMesh = new THREE.Mesh(g);
          invMesh.name = mesh.name;
          roomZones.push({ id: mesh.name, mesh: invMesh, bbox: g.boundingBox.clone() });
        }
      }
    }
  });

  if (!parts.length || !firstBBox) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged || !merged.attributes.position) return null;
  if (!merged.attributes.normal) merged.computeVertexNormals();
  return { geo: merged, firstBBox, roomZones };
}

interface SingleNavmeshProps {
  floorId: string;
  url: string;
  /** Fired once with the merged geometry for this floor. */
  onGeometry: (floorId: string, geo: THREE.BufferGeometry) => void;
  /** Fired once with the first-mesh bbox — used for minimap bounds. */
  onFloorBounds?: (floorId: string, bounds: FloorBounds) => void;
  /** Fired once with named-mesh room zones for room detection. */
  onRoomZones?: (floorId: string, zones: RoomZone[]) => void;
  /** Fired after geometry has been delivered to the parent. */
  onLoaded?: () => void;
  debug?: boolean;
  /** Actually draw the overlay. The debug panel's "show navmesh" switch. */
  show?: boolean;
  /** Let the world occlude the overlay. Off, it is drawn straight through —
   *  see `navmeshDepth` in the debug store for why that is the default. */
  depthTest?: boolean;
}

const DRACO_PATH = "/draco/";

function SingleNavmeshContent({
  floorId, url, onGeometry, onFloorBounds, onRoomZones, onLoaded, debug, show, depthTest = false,
}: SingleNavmeshProps) {
  const { scene } = useGLTF(url, DRACO_PATH);
  const done = useRef(false);
  const [debugGeo, setDebugGeo] = useState<THREE.BufferGeometry | null>(null);

  useLayoutEffect(() => {
    if (done.current || !scene?.children?.length) return;
    scene.updateWorldMatrix(true, true);
    const result = extractGeo(scene);
    if (!result) return;
    done.current = true;

    onGeometry(floorId, result.geo);

    if (onFloorBounds) {
      const b = result.firstBBox;
      onFloorBounds(floorId, {
        xMin: b.min.x, xMax: b.max.x,
        yMin: b.min.y, yMax: b.max.y,
        zMin: b.min.z, zMax: b.max.z,
      });
    }

    if (onRoomZones && result.roomZones.length > 0) {
      onRoomZones(floorId, result.roomZones);
    }

    if (debug) {
      setDebugGeo(result.geo);
      const position = result.geo.getAttribute("position");
      useDebugStore.getState().setNavmeshTriangles(position ? position.count / 3 : 0);
    }
    onLoaded?.();
  }, [scene, floorId, onGeometry, onFloorBounds, onRoomZones, onLoaded, debug]);

  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  return (
    <>
      <Bvh firstHitOnly={false}>
        <primitive object={scene} visible={false} />
      </Bvh>
      {debugGeo && show && (
        <>
          <mesh geometry={debugGeo} renderOrder={999}>
            <meshBasicMaterial
              color="#00ff88"
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
              depthWrite={false}
              depthTest={depthTest}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>
          <mesh geometry={debugGeo} renderOrder={1000}>
            <meshBasicMaterial
              color="#006644"
              wireframe
              transparent
              opacity={0.6}
              depthWrite={false}
              depthTest={depthTest}
              polygonOffset
              polygonOffsetFactor={-6}
              polygonOffsetUnits={-6}
            />
          </mesh>
        </>
      )}
    </>
  );
}

export function SingleNavmesh(props: SingleNavmeshProps) {
  return (
    <Suspense fallback={null}>
      <SingleNavmeshContent {...props} />
    </Suspense>
  );
}
