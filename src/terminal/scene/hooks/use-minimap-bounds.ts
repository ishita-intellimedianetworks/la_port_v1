"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FloorConfig } from "@/shared/types";
import type { MinimapData } from "../../map/types";
import type { FloorBounds } from "../navmesh/geometry";

interface UseMinimapBoundsOptions {
  activeFloor: FloorConfig;
  navReady: boolean;
  setMinimapData: (d: MinimapData) => void;
}

type Bounds = MinimapData["bounds"];

export function useMinimapBounds({
  activeFloor,
  navReady,
  setMinimapData,
}: UseMinimapBoundsOptions) {
  const modelBoundsMapRef = useRef<Record<string, THREE.Box3>>({});
  const [modelBoundsVersion, setModelBoundsVersion] = useState(0);
  const floorBoundsRef = useRef<Record<string, FloorBounds>>({});

  const setFloorBounds = useCallback((bounds: Record<string, FloorBounds>) => {
    floorBoundsRef.current = bounds;
  }, []);

  const setModelBounds = useCallback((floorId: string, bbox: THREE.Box3) => {
    const previous = modelBoundsMapRef.current[floorId];
    if (previous && previous.equals(bbox)) return;
    modelBoundsMapRef.current[floorId] = bbox;
    setModelBoundsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!activeFloor.floorPlanUrl || !navReady) return;

    const stickers = activeFloor.stickers;

    const mb = modelBoundsMapRef.current[activeFloor.id];
    if (mb) {
      const bounds: Bounds = { minX: mb.max.x, maxX: mb.min.x, minZ: mb.max.z, maxZ: mb.min.z };
      setMinimapData({ imageUrl: activeFloor.floorPlanUrl, bounds, stickers });
      return;
    }

    const b = floorBoundsRef.current[activeFloor.id];
    if (b) {
      const bounds: Bounds = { minX: b.xMax, maxX: b.xMin, minZ: b.zMax, maxZ: b.zMin };
      setMinimapData({ imageUrl: activeFloor.floorPlanUrl, bounds, stickers });
    }
  }, [activeFloor, navReady, modelBoundsVersion, setMinimapData]);

  return { setFloorBounds, setModelBounds };
}
