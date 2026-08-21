import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { FloorConfig } from "@/shared/types";
import { zoneNameForFloor } from "../navmesh";

// ─────────────────────────────────────────────────────────────────────────────
// FloorMatch — result of checking which navmesh zone best matches a 3D point
// ─────────────────────────────────────────────────────────────────────────────
export interface FloorMatch {
  floorIndex: number;
  zoneName: string;
  group: number;
  closestPoint: THREE.Vector3;
  distance: number;
}

export interface FindFloorOptions {
  /**
   * If provided, applies hysteresis: stay on currentFloorIndex unless another
   * floor is at least `hysteresisM` closer in combined XZ+Y distance. Prevents
   * single-step flicker when the player is near a staircase boundary.
   */
  currentFloorIndex?: number;
  /** Minimum improvement (in metres) required to switch floors. Default 0.6m. */
  hysteresisM?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Find the floor the probe point belongs to.
//
// Algorithm: for each floor zone, find the closest navmesh node in XZ across
// all groups. Score = full 3D distance from probe to that node. The floor with
// the smallest score wins — i.e. the floor whose nearest walkable surface is
// physically closest to the probe.
//
// IMPORTANT: callers must pass FEET Y, not camera Y. Camera Y biases detection
// toward the floor above (cameraHeight matters less than the typical inter-floor
// gap, but for short floors or non-standard cameraHeight the bias flips the
// answer). The double-click path passes the raycast hit Y, which is also at
// surface level.
//
// Hysteresis: when called from the per-frame poll, pass currentFloorIndex so
// the function only swaps floors when there's a clear winner. This eliminates
// flicker on stairs where two floors' nearest nodes are roughly equidistant.
// ─────────────────────────────────────────────────────────────────────────────
export function findBestFloorForPoint(
  point: THREE.Vector3,
  floors: FloorConfig[],
  pathfinding: Pathfinding,
  opts: FindFloorOptions = {},
): FloorMatch | null {
  const { currentFloorIndex = -1, hysteresisM = 0.6 } = opts;

  interface Candidate {
    floorIndex: number;
    zoneName: string;
    group: number;
    closestPoint: THREE.Vector3;
    score: number;  // 3D distance to nearest walkable node
  }

  const candidates: Candidate[] = [];

  for (let i = 0; i < floors.length; i++) {
    const zoneName = zoneNameForFloor(floors[i].id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zone = (pathfinding as any).zones?.[zoneName];
      if (!zone) continue;

      const numGroups: number = zone.groups?.length ?? 0;
      let bestScore = Infinity;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let bestNode: any = null;
      let bestGroup = 0;

      for (let g = 0; g < numGroups; g++) {
        const node = pathfinding.getClosestNode(point, zoneName, g);
        if (!node) continue;
        const dx = node.centroid.x - point.x;
        const dy = node.centroid.y - point.y;
        const dz = node.centroid.z - point.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < bestScore) { bestScore = d; bestNode = node; bestGroup = g; }
      }
      if (!bestNode) continue;

      candidates.push({
        floorIndex: i,
        zoneName,
        group: bestGroup,
        closestPoint: new THREE.Vector3(bestNode.centroid.x, bestNode.centroid.y, bestNode.centroid.z),
        score: bestScore,
      });
    } catch { /* zone not loaded yet */ }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.score - b.score);
  let best = candidates[0];

  // Hysteresis: refuse to switch off the current floor unless the new winner
  // is at least hysteresisM closer.
  if (currentFloorIndex >= 0 && best.floorIndex !== currentFloorIndex) {
    const current = candidates.find(c => c.floorIndex === currentFloorIndex);
    if (current && current.score - best.score < hysteresisM) {
      best = current;
    }
  }

  return {
    floorIndex: best.floorIndex,
    zoneName: best.zoneName,
    group: best.group,
    closestPoint: best.closestPoint,
    distance: best.score,
  };
}
