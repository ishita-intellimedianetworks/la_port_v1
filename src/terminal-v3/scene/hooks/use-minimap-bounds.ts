"use client";

/**
 * useMinimapBounds
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves minimap bounds for the active floor from the model's XZ bbox.
 *
 * Priority:
 *   model bbox (boundsUrl / modelUrl GLB) → navmesh bbox fallback.
 *
 * The "model bbox" here is whichever GLB the parent decided to wire up for
 * bounds measurement — typically the floor's `modelUrl`, but when a floor
 * authors a separate `boundsUrl` (a clean this-floor-only GLB used purely
 * for bbox measurement) the parent mounts that one and routes its bbox
 * through the same setter.
 *
 * The click→world mapping in `use-minimap.ts` is a linear interpolation from
 * (0..lb.dw, 0..lb.dh) → (minX..maxX, minZ..maxZ). For that mapping to be
 * accurate, the floor-plan PNG MUST be a top-down orthographic render whose
 * frame matches the bbox exactly — same XZ extents, same aspect ratio, no
 * padding/crop. See the asset requirements documented next to the
 * `boundsUrl` / `floorPlanUrl` fields in scene-config.
 *
 * Image orientation: the published bounds swap both axes (minX←maxX,
 * minZ←maxZ), encoding the 180° rotation between world XZ and PNG pixel
 * space that the rest of the pipeline expects.
 */

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

  // Store model bounds when a model reports them.
  // The version bump is what makes the minimap re-resolve, so it must happen
  // ONLY on a real change. Bumping unconditionally turned every repeated report
  // of identical bounds into a re-render — and the reporter re-runs whenever the
  // model effect does, so the two fed each other.
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
