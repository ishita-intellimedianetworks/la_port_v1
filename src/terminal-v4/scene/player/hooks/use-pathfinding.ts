import { useCallback } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import { yaw } from "../utils/math-utils";
import { closestNavmeshPoint } from "../utils/probe-floor-y";
import { findPathWeighted, findPathsWeighted } from "../../utils/weighted-path";
import type { PlayerState } from "../types";

const ROUTE_Y_BAND = 2.5;
const MAX_ROUTE_SLOPE = 0.45;
const MIN_RISE = 0.8;

function sanitizeRoute(fromY: number, pts: THREE.Vector3[], debug = false): THREE.Vector3[] {
  if (!pts.length) return pts;
  const endY = pts[pts.length - 1].y;
  const lo = Math.min(fromY, endY) - ROUTE_Y_BAND;
  const hi = Math.max(fromY, endY) + ROUTE_Y_BAND;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const rise = prev ? Math.abs(p.y - prev.y) : 0;
    const run = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 1;
    const steep = rise > MIN_RISE && rise / Math.max(run, 0.001) > MAX_ROUTE_SLOPE;
    if (p.y < lo || p.y > hi || steep) {
      if (debug) {
        console.log(
          `[Nav] route truncated at waypoint ${i}/${pts.length} — ` +
          (steep ? `${(rise / Math.max(run, 0.001)).toFixed(2)} grade` : "leaves the level band"),
        );
      }
      return pts.slice(0, i);
    }
    prev = p;
  }
  return pts;
}

interface NavTargetIn { x: number; y?: number; eyeY?: number; z: number }

function targetFloorY(t: NavTargetIn, floorY: number, cameraHeight: number): number {
  if (t.y !== undefined) return t.y;
  if (t.eyeY !== undefined) return t.eyeY - cameraHeight;
  return floorY;
}

interface UsePathfindingOptions {
  state: PlayerState;
  pathfinding: Pathfinding;
  cameraHeight: number;
  setMoving: (v: boolean) => void;
  routeSanitize?: boolean;
  debug: boolean;
}

export function usePathfinding({
  state,
  pathfinding,
  cameraHeight,
  setMoving,
  routeSanitize = true,
  debug,
}: UsePathfindingOptions) {
  const stopNavigation = useCallback(() => {
    setMoving(false);
    state.path.current = [];
    state.pathI.current = 0;
    state.onNavComplete.current = null;
    state.vizGrp.current?.clear();
    state.lookAtTween.current?.kill();
    state.lookAtTween.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMoving]);

  const computePath = useCallback(
    (target: NavTargetIn, overrideZone?: string): THREE.Vector3[] | null => {
      const zone = overrideZone ?? state.currentZone.current;
      const floorY = state.pos.current.y - cameraHeight;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(pathfinding as any).zones?.[zone]) return null;
      try {
        const fromPt = new THREE.Vector3(state.pos.current.x, floorY, state.pos.current.z);
        const targetPt = new THREE.Vector3(target.x, targetFloorY(target, floorY, cameraHeight), target.z);
        const group = pathfinding.getGroup(zone, fromPt) ?? 0;
        const startNode = pathfinding.getClosestNode(fromPt, zone, group);
        const targetNode = pathfinding.getClosestNode(targetPt, zone, group);
        if (!startNode || !targetNode) return null;
        let result = findPathWeighted(pathfinding, fromPt, targetNode.centroid, zone, group);
        if (!result?.length) result = findPathWeighted(pathfinding, startNode.centroid, targetNode.centroid, zone, group);
        if (!result?.length) return null;
        const raw = result.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        const clean = routeSanitize ? sanitizeRoute(floorY, raw) : raw;
        if (!clean.length) return null;
        const END_NEAR_TOL = 6;
        const end = clean[clean.length - 1];
        if (Math.hypot(end.x - targetPt.x, end.z - targetPt.z) > END_NEAR_TOL) return null;
        return clean;
      } catch {
        return null;
      }
    },
    [state.currentZone, state.pos, cameraHeight, pathfinding, routeSanitize],
  );

  const previewTo = useCallback(
    (target: NavTargetIn, overrideZone?: string): boolean => {
      const path = computePath(target, overrideZone);
      // eslint-disable-next-line react-hooks/immutability -- ref mutation (same pattern as navigateToPoint)
      state.previewPath.current = path ?? [];
      return !!path;
    },
    [computePath, state.previewPath],
  );

  const clearPreview = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- ref mutation (same pattern as navigateToPoint)
    state.previewPath.current = [];
  }, [state.previewPath]);

  const measurePathTo = useCallback(
    (target: NavTargetIn, overrideZone?: string): number | null => {
      const path = computePath(target, overrideZone);
      if (!path?.length) return null;
      let len = Math.hypot(path[0].x - state.pos.current.x, path[0].z - state.pos.current.z);
      for (let i = 0; i < path.length - 1; i++) {
        len += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
      }
      return len;
    },
    [computePath, state.pos],
  );

  const measurePathsTo = useCallback(
    (targets: NavTargetIn[], overrideZone?: string): (number | null)[] => {
      const zone = overrideZone ?? state.currentZone.current;
      const floorY = state.pos.current.y - cameraHeight;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!targets.length || !(pathfinding as any).zones?.[zone]) return targets.map(() => null);
      try {
        const fromPt = new THREE.Vector3(state.pos.current.x, floorY, state.pos.current.z);
        const group = pathfinding.getGroup(zone, fromPt) ?? 0;
        const targetPts = targets.map((t) => new THREE.Vector3(t.x, targetFloorY(t, floorY, cameraHeight), t.z));
        const paths = findPathsWeighted(pathfinding, fromPt, targetPts, zone, group);
        const END_NEAR_TOL = 6;
        return paths.map((raw, i) => {
          if (!raw?.length) return null;
          const clean = routeSanitize ? sanitizeRoute(floorY, raw) : raw;
          if (!clean.length) return null;
          const end = clean[clean.length - 1];
          const tp = targetPts[i];
          if (Math.hypot(end.x - tp.x, end.z - tp.z) > END_NEAR_TOL) return null;
          let len = Math.hypot(clean[0].x - state.pos.current.x, clean[0].z - state.pos.current.z);
          for (let j = 0; j < clean.length - 1; j++) {
            len += Math.hypot(clean[j + 1].x - clean[j].x, clean[j + 1].z - clean[j].z);
          }
          return len;
        });
      } catch {
        return targets.map(() => null);
      }
    },
    [state.currentZone, state.pos, cameraHeight, pathfinding, routeSanitize],
  );

  const navigateToPoint = useCallback(
    (
      target: NavTargetIn,
      overrideZone?: string,
      onDone?: () => void,
    ): boolean => {
      const zone = overrideZone ?? state.currentZone.current;
      const floorY = state.pos.current.y - cameraHeight;
      const targetPt = new THREE.Vector3(
        target.x,
        targetFloorY(target, floorY, cameraHeight),
        target.z,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(pathfinding as any).zones?.[zone]) {
        console.warn(`[PlayerController] Zone "${zone}" not found`);
        return false;
      }

      try {
        const fromPt = new THREE.Vector3(
          state.pos.current.x,
          floorY,
          state.pos.current.z,
        );

        const group = pathfinding.getGroup(zone, fromPt) ?? 0;

        const startNode  = pathfinding.getClosestNode(fromPt,   zone, group);
        const targetNode = pathfinding.getClosestNode(targetPt, zone, group);
        if (!startNode || !targetNode) {
          console.warn(`[PlayerController] No start/target node in "${zone}"`);
          return false;
        }

        let result = findPathWeighted(pathfinding, fromPt, targetNode.centroid, zone, group);
        if (!result?.length) {
          result = findPathWeighted(pathfinding, startNode.centroid, targetNode.centroid, zone, group);
        }

        if (!result?.length) {
          console.warn(
            `[PlayerController] No walkable path in "${zone}" from ` +
            `(${fromPt.x.toFixed(2)},${fromPt.z.toFixed(2)}) to ` +
            `(${targetPt.x.toFixed(2)},${targetPt.z.toFixed(2)})`,
          );
          return false;
        }

        const rawPts = result.map((p) => new THREE.Vector3(p.x, p.y, p.z));
        let clean = routeSanitize ? sanitizeRoute(floorY, rawPts, true) : rawPts;
        if (!clean.length) {
          for (const f of [1, 0.66, 0.33]) {
            const cx = fromPt.x + (targetPt.x - fromPt.x) * f;
            const cz = fromPt.z + (targetPt.z - fromPt.z) * f;
            const re = closestNavmeshPoint(
              pathfinding, zone, cx, floorY, cz,
              floorY - ROUTE_Y_BAND, floorY + ROUTE_Y_BAND, group,
            );
            if (!re) continue;
            const reNode = pathfinding.getClosestNode(
              new THREE.Vector3(re.x, re.y, re.z), zone, group,
            );
            if (!reNode) continue;
            let reRoute = findPathWeighted(pathfinding, fromPt, reNode.centroid, zone, group);
            if (!reRoute?.length) reRoute = findPathWeighted(pathfinding, startNode.centroid, reNode.centroid, zone, group);
            if (!reRoute?.length) continue;
            const reClean = sanitizeRoute(floorY, reRoute.map((p) => new THREE.Vector3(p.x, p.y, p.z)), true);
            if (!reClean.length) continue;
            const end = reClean[reClean.length - 1];
            if (Math.hypot(end.x - fromPt.x, end.z - fromPt.z) < 1.0) continue;
            clean = reClean;
            break;
          }
        }
        if (!clean.length) {
          console.warn("[PlayerController] Route rejected — it immediately leaves the walkable level");
          return false;
        }
        state.path.current = clean;

        let firstI = 0;
        const skipSq = 0.05 * 0.05;
        while (firstI < state.path.current.length - 1) {
          const w = state.path.current[firstI];
          const ddx = w.x - state.pos.current.x;
          const ddz = w.z - state.pos.current.z;
          if (ddx * ddx + ddz * ddz > skipSq) break;
          firstI++;
        }
        state.pathI.current = firstI;
        state.onNavComplete.current = onDone ?? null;

        const LOOK_AHEAD = 2.0;
        let rem = LOOK_AHEAD;
        const aim = new THREE.Vector3().copy(state.pos.current);
        for (let i = firstI; i < state.path.current.length && rem > 0; i++) {
          const w = state.path.current[i];
          const ddx = w.x - aim.x;
          const ddz = w.z - aim.z;
          const d = Math.sqrt(ddx * ddx + ddz * ddz);
          if (d <= rem) { aim.copy(w); rem -= d; }
          else { aim.x += ddx * (rem / d); aim.z += ddz * (rem / d); break; }
        }
        state.yawT.current = yaw(state.pos.current, aim);
        state.lookAtTween.current?.kill();
        state.lookAtTween.current = null;
        state.idleOn.current = false;
        setMoving(true);

        state.vizGrp.current?.clear();
        if (state.vizGrp.current && debug) {
          state.vizGrp.current.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(state.path.current),
              new THREE.LineBasicMaterial({ color: 0x00ffff }),
            ),
          );
        }
        return true;
      } catch (e) {
        console.error(`[PlayerController] Error in "${zone}":`, e);
        return false;
      }
    },
    [
      state.currentZone,
      state.idleOn,
      state.pos,
      state.path,
      state.pathI,
      state.onNavComplete,
      state.yawT,
      state.rot,
      state.vizGrp,
      cameraHeight,
      pathfinding,
      setMoving,
      routeSanitize,
      debug,
    ],
  );

  return { navigateToPoint, stopNavigation, previewTo, clearPreview, measurePathTo, measurePathsTo };
}
