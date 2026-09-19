"use client";

import { useCallback, useRef } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Single-zone navmesh manager.
 *
 * Only ONE floor's navmesh is mounted at any time — the active floor's.
 * On floor switch, the previous navmesh GLB unloads and this manager
 * registers a fresh Pathfinding zone named `zone_<floorId>` for the new
 * floor. There is no cross-floor merged zone; inter-floor travel happens
 * exclusively through the FloorTransitionPortal cinematic.
 */

export function zoneNameForFloor(floorId: string): string {
  return `zone_${floorId}`;
}

// Weld tolerance (m) — TIGHT, and no longer escalated. The old progressive
// 0.05→0.5 escalation kept widening until the zone became ONE group; on the
// memorial mesh (genuine islands metres apart) it always ended at 0.5, and a
// half-unit weld on sub-unit-wide walkable strips collapses them and invents
// cross-strip links — the "paths not on the navmesh". Multiple groups are
// FINE: routing stays within the player's group, and genuinely disconnected
// areas correctly read as teleport-only.
const WELD_TOLERANCES = [0.05];

function weldToSingleGroup(geometry: THREE.BufferGeometry): {
  zoneData: ReturnType<typeof Pathfinding.createZone>;
  tolerance: number;
  groups: number;
} {
  // Weld by POSITION ONLY: mergeVertices hashes every attribute, so vertices
  // split by hard-normal seams (the glTF exporter duplicates them) would never
  // merge and every shading seam would become a fake walkability break.
  // Pathfinding only needs positions anyway.
  const posOnly = geometry.clone();
  for (const name of Object.keys(posOnly.attributes)) {
    if (name !== "position") posOnly.deleteAttribute(name);
  }
  let last: { zoneData: ReturnType<typeof Pathfinding.createZone>; tolerance: number; groups: number } | null = null;
  for (const t of WELD_TOLERANCES) {
    const welded = mergeVertices(posOnly.clone(), t);
    const zoneData = Pathfinding.createZone(welded);
    welded.dispose();
    const groups = zoneData.groups?.length ?? 0;
    last = { zoneData, tolerance: t, groups };
    if (groups <= 1) break;
  }
  posOnly.dispose();
  return last!;
}

export interface NavmeshBounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface NavmeshManagerProps {
  pathfinding: Pathfinding;
  /** Fired once the active floor's zone has been registered. */
  onReady: (floorId: string) => void;
}

/**
 * Headless hook. `registerFloor(floorId, geometry)` welds the geometry,
 * creates a Pathfinding zone for that floor, and fires `onReady`.
 *
 * Only one zone is kept alive at a time — when a different floor is
 * registered the previous zone is deleted from the Pathfinding instance.
 * Stale zones lying around would confuse cross-floor heuristics like
 * `findBestFloorForPoint` and waste memory; the active floor is the only
 * walkable surface anyway.
 */
export function useNavmeshManager({ pathfinding, onReady }: NavmeshManagerProps) {
  const lastFloorIdRef = useRef<string | null>(null);

  const registerFloor = useCallback((floorId: string, geometry: THREE.BufferGeometry) => {
    const zoneName = zoneNameForFloor(floorId);
    try {
      const { zoneData } = weldToSingleGroup(geometry);

      const prev = lastFloorIdRef.current;
      if (prev && prev !== floorId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const zones = (pathfinding as any).zones as Record<string, unknown> | undefined;
        if (zones) delete zones[zoneNameForFloor(prev)];
      }

      pathfinding.setZoneData(zoneName, zoneData);
      lastFloorIdRef.current = floorId;
      onReady(floorId);
    } catch (e) {
      console.error(`[Navmesh] Failed to create zone "${zoneName}"`, e);
      onReady(floorId);
    }
  }, [pathfinding, onReady]);

  return { registerFloor };
}
