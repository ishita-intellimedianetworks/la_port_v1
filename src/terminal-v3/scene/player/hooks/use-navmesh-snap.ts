/* eslint-disable react-hooks/immutability */
/**
 * useNavmeshSnap
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot effect that runs on mount (once navmesh + player are ready).
 * Probes the navmesh directly below the spawn point and snaps the player's
 * Y to the exact floor surface, preventing the camera from spawning mid-air
 * or underground when floor geometry doesn't sit at Y = 0.
 */
import { useEffect } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { PlayerState } from "../types";

interface UseNavmeshSnapOptions {
  state: PlayerState;
  enabled: boolean;
  pathfinding: Pathfinding;
  cameraHeight: number;
  camera: THREE.Camera;
}

/**
 * One-shot effect: snaps the player's Y position onto the navmesh surface
 * as soon as the nav graph is ready. Runs once per mount.
 */
export function useNavmeshSnap({
  state,
  enabled,
  pathfinding,
  cameraHeight,
  camera,
}: UseNavmeshSnapOptions) {
  useEffect(() => {
    if (state.snapped.current || !enabled) return;

    const zone = state.currentZone.current;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(pathfinding as any).zones?.[zone]) return;

      const fp = new THREE.Vector3(
        state.pos.current.x,
        state.pos.current.y - cameraHeight,
        state.pos.current.z,
      );
      const g = pathfinding.getGroup(zone, fp);
      if (g !== null) {
        const node = pathfinding.getClosestNode(fp, zone, g);
        if (node) {
          const y = node.centroid.y + cameraHeight;
          state.pos.current.y      = y;
          state.targetY.current    = y;
          state.initPos.current.y  = y;
          camera.position.y        = y;
        }
      }
    } catch { /* zone not loaded yet */ }

    state.snapped.current = true;
  }, [enabled, pathfinding, cameraHeight, camera, state.snapped, state.currentZone, state.pos, state.targetY, state.initPos]);
}
