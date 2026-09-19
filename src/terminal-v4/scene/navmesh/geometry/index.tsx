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

// Extract all meshes from a GLTF scene
//   geo       — all submeshes merged (used for pathfinding zones)
//   firstBBox — bounding box of the FIRST mesh only (used for minimap bounds)
//   roomZones — per-named-mesh zone data for room detection
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

// Single-floor navmesh loader
// Mirrors SingleModel: one GLB at a time, loaded for the active floor only.
// When the active floor changes the parent re-keys this component, the old
// GLB is released, and the new floor's navmesh is fetched and registered.
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
  /**
   * `?debug=true`. Keeps a reference to the merged geometry so the overlay
   * below CAN be drawn — separate from `show`, because the merge happens once
   * in a layout effect that has already run by the time anyone reaches for the
   * toggle. Capturing is a reference, not a copy; it costs nothing.
   */
  debug?: boolean;
  /** Actually draw the overlay. The debug panel's "show navmesh" switch. */
  show?: boolean;
  /** Let the world occlude the overlay. Off, it is drawn straight through —
   *  see `navmeshDepth` in the debug store for why that is the default. */
  depthTest?: boolean;
}

// The navmesh ships inside the baked asset set, where it is Draco-compressed
// (8 KB against the 305 KB raw export). Point drei at the decoder committed
// under public/draco/ — its default is a gstatic CDN path, which would make an
// otherwise self-contained app fetch a decoder from the internet to be able to
// walk, and fail offline.
const DRACO_PATH = "/draco/";

function SingleNavmeshContent({
  floorId, url, onGeometry, onFloorBounds, onRoomZones, onLoaded, debug, show, depthTest = false,
}: SingleNavmeshProps) {
  const { scene } = useGLTF(url, DRACO_PATH);
  const done = useRef(false);
  const [debugGeo, setDebugGeo] = useState<THREE.BufferGeometry | null>(null);

  useLayoutEffect(() => {
    if (done.current || !scene?.children?.length) return;
    // Force matrices to current. Without this, a freshly-mounted navmesh (e.g.
    // after a floor swap) can still have stale matrixWorld values when this
    // effect fires, and `applyMatrix4(mesh.matrixWorld)` inside extractGeo
    // leaves the welded geometry in LOCAL coords. Floors authored at non-zero
    // Y then end up at Y=0 in the Pathfinding zone — player sits above the
    // navmesh and findPath returns no walkable path.
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
      // Reported to the panel as a readout. Without it, "the toggle is off" and
      // "the toggle is on but you are looking through an overlay that never
      // captured a mesh" are the same blank screen.
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
      {/* Invisible, but raycasters still traverse it (three tests meshes
          regardless of visibility) — BVH keeps those wasted tests cheap on
          dense navmeshes (the stadium's has 44k triangles). */}
      <Bvh firstHitOnly={false}>
        <primitive object={scene} visible={false} />
      </Bvh>
      {debugGeo && show && (
        <>
          {/* Walkable surface — bright green fill. `depthTest` decides which
              question it answers, and the default is the FIRST one:

                off  painted over everything, so you always see the mesh. The
                     navmesh lies within centimetres of the apron it describes
                     over a kilometre of site, and depth-tested most of it
                     loses that z-fight — which reads as the toggle doing
                     nothing at all.
                on   drawn at its ACTUAL depth, so a patch floating above or
                     sunk below the floor reads as such.

              Double-sided either way, so it stays readable from any viewpoint,
              and polygonOffset still helps the depth-tested case. */}
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
          {/* Triangle edges — shows the actual mesh structure (where corridors
              end, what the coverage really is). Follows the fill's depth mode
              so the edges sit on the same surface the fill is drawn at. */}
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
