import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { FloorConfig } from "@/shared/types";
import type { PlayerControllerHandle } from "../player";
import { findBestFloorForPoint } from "../utils/nav-utils";
import { findPathWeighted } from "../utils/weighted-path";
import { closestNavmeshPoint, probeFloorY } from "../player/utils/probe-floor-y";
import { zoneNameForFloor } from "../navmesh";

const ON_MESH_CLICK_Y_TOL = 2;

const SNAP_MAX_DIST = 30;

const TARGET_MAX_DY = 6;

const ROUTE_Y_BAND = 2.5;

const MAX_ROUTE_SLOPE = 0.45;

interface DoubleClickNavOptions {
  gl: { domElement: HTMLElement };
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  scene: THREE.Scene;
  navReady: boolean;
  enabled: boolean;
  floors: FloorConfig[];
  pathfinding: Pathfinding;
  playerControllerRef: RefObject<PlayerControllerHandle | null>;
  navigateToFloor: (ctrl: PlayerControllerHandle, pt: THREE.Vector3, zoneName: string) => void;
}

export function useDoubleClickNav({
  gl,
  camera,
  raycaster,
  scene,
  navReady,
  enabled,
  floors,
  pathfinding,
  playerControllerRef,
  navigateToFloor,
}: DoubleClickNavOptions) {
  const navigateToFloorRef = useRef(navigateToFloor);
  useLayoutEffect(() => { navigateToFloorRef.current = navigateToFloor; });

  useEffect(() => {
    if (!enabled) return;
    const dom = gl.domElement;
    let drag  = false;
    let sx    = 0;
    let sy    = 0;

    const onDown = (e: PointerEvent) => {
      drag = false;
      sx   = e.clientX;
      sy   = e.clientY;
    };

    const onMove = (e: PointerEvent) => {
      if (e.buttons === 1 && (Math.abs(e.clientX - sx) > 5 || Math.abs(e.clientY - sy) > 5)) {
        drag = true;
      }
    };

    const onDblClick = (e: MouseEvent) => {
      if (drag || !navReady) return;

      const rect  = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      const hits = raycaster.intersectObjects(scene.children, true);
      if (!hits.length) return;

      const pt   = hits[0].point;
      const ctrl = playerControllerRef.current;
      if (!ctrl) return;

      const currentZone = ctrl.getCurrentZone();
      const activeFloor = floors.find(f => zoneNameForFloor(f.id) === currentZone);
      const searchFloors = activeFloor ? [activeFloor] : floors;
      const guardRoutes = activeFloor?.routeSanitize !== false;
      const match = findBestFloorForPoint(pt, searchFloors, pathfinding);
      if (!match) return;

      const foot = ctrl.getFootPosition();
      const fromPt = new THREE.Vector3(foot.x, foot.y, foot.z);
      const playerGroup = pathfinding.getGroup(match.zoneName, fromPt) ?? 0;

      const surfaceY = probeFloorY(pathfinding, match.zoneName, pt.x, pt.z, pt.y);
      let target: THREE.Vector3 | null = null;
      if (surfaceY != null && Math.abs(surfaceY - pt.y) <= ON_MESH_CLICK_Y_TOL) {
        target = new THREE.Vector3(pt.x, surfaceY, pt.z);
      } else {
        const snap = closestNavmeshPoint(
          pathfinding, match.zoneName, pt.x, pt.y, pt.z,
          -Infinity, Infinity, playerGroup,
        );
        if (snap && snap.dist <= SNAP_MAX_DIST) {
          target = new THREE.Vector3(snap.x, snap.y, snap.z);
        } else {
          return;
        }
      }

      if (guardRoutes && Math.abs(target.y - foot.y) > TARGET_MAX_DY) {
        const clamped = closestNavmeshPoint(
          pathfinding, match.zoneName, pt.x, foot.y, pt.z,
          foot.y - TARGET_MAX_DY, foot.y + TARGET_MAX_DY, playerGroup,
        );
        if (!clamped) return;
        target = new THREE.Vector3(clamped.x, clamped.y, clamped.z);
      }

      if (guardRoutes) try {
        const group = playerGroup;

        const validateEnd = (tgt: THREE.Vector3): THREE.Vector3 | null => {
          let route = findPathWeighted(pathfinding, fromPt, tgt, match.zoneName, group);
          if (!route?.length) {
            const startNode  = pathfinding.getClosestNode(fromPt, match.zoneName, group);
            const targetNode = pathfinding.getClosestNode(tgt,    match.zoneName, group);
            if (startNode && targetNode) {
              route = findPathWeighted(pathfinding, startNode.centroid, targetNode.centroid, match.zoneName, group);
            }
          }
          if (!route?.length) return tgt;
          const lo = Math.min(foot.y, tgt.y) - ROUTE_Y_BAND;
          const hi = Math.max(foot.y, tgt.y) + ROUTE_Y_BAND;
          let cut = -1;
          let prev = fromPt;
          for (let i = 0; i < route.length; i++) {
            const p = route[i];
            if (p.y < lo || p.y > hi) { cut = i; break; }
            const run = Math.hypot(p.x - prev.x, p.z - prev.z);
            const rise = Math.abs(p.y - prev.y);
            if (rise > 0.8 && rise / Math.max(run, 0.001) > MAX_ROUTE_SLOPE) {
              cut = i; break;
            }
            prev = p;
          }
          if (cut === -1) return tgt;
          const last = cut > 0 ? route[cut - 1] : fromPt;
          if (Math.hypot(last.x - foot.x, last.z - foot.z) < 1.5) {
            return null;
          }
          return new THREE.Vector3(last.x, last.y, last.z);
        };

        let end = validateEnd(target);
        if (!end) {
          const sameLevel = closestNavmeshPoint(
            pathfinding, match.zoneName, pt.x, foot.y, pt.z,
            foot.y - ROUTE_Y_BAND, foot.y + ROUTE_Y_BAND, playerGroup,
          );
          if (sameLevel) {
            const clamped = new THREE.Vector3(sameLevel.x, sameLevel.y, sameLevel.z);
            end = validateEnd(clamped) ?? clamped;
          }
        }
        if (!end) return;
        target = end;
      } catch {}

      navigateToFloorRef.current(ctrl, target, match.zoneName);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("dblclick",    onDblClick);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("dblclick",    onDblClick);
    };
  }, [gl, enabled, navReady, floors, pathfinding, camera, raycaster, scene, playerControllerRef]);
}
