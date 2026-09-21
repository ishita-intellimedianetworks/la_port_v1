"use client";

import { useCallback, useRef } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function zoneNameForFloor(floorId: string): string {
  return `zone_${floorId}`;
}

const WELD_TOLERANCES = [0.05];

function weldToSingleGroup(geometry: THREE.BufferGeometry): {
  zoneData: ReturnType<typeof Pathfinding.createZone>;
  tolerance: number;
  groups: number;
} {
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
