/**
 * useDoubleClickNav
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens for double-click on the R3F canvas and navigates to the 3D hit point:
 *   1. Converts screen coords to NDC → raycasts into the scene
 *   2. findBestFloorForPoint picks the closest navmesh zone across all floors
 *   3. Calls navigateToFloor (same-floor walk OR cross-floor teleport)
 *
 * Drag detection (5 px threshold) prevents accidental navigation after panning.
 * navigateToFloor is stored in an always-current ref (updated via useLayoutEffect)
 * so the event listeners never need to be re-registered when the callback changes.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { FloorConfig } from "@/shared/types";
import type { PlayerControllerHandle } from "../player";
import { findBestFloorForPoint } from "../utils/nav-utils";
import { findPathWeighted } from "../utils/weighted-path";
import { closestNavmeshPoint, probeFloorY } from "../player/utils/probe-floor-y";
import { zoneNameForFloor } from "../navmesh";

/** Max height (world units) the clicked point may sit above/below the navmesh
 *  surface at that XZ and still count as clicking the WALKABLE GROUND. Clicks
 *  on stands / roofs / anything off-mesh are rejected instead of snapping to
 *  the nearest walkable node (which started walks to places the click never
 *  meant, crossing visually non-walkable areas). */
const ON_MESH_CLICK_Y_TOL = 2;

/** An off-mesh click walks to the NEAREST navmesh point instead (every venue)
 *  — but only within this range, so a click on the sky dome / a distant roof
 *  still does nothing rather than launching a walk to some unrelated corridor
 *  edge. The walk itself always paths through the navmesh (A*). */
const SNAP_MAX_DIST = 30;

/** Double-click walks stay on the player's CURRENT level: a target more than
 *  this far above/below the feet (the memorial's upper stands are +21) is
 *  ignored — other levels are reached via the gate/POI destinations. */
const TARGET_MAX_DY = 6;

/** The memorial navmesh (v1) also covers the seating bowl, so the shortest
 *  route between far points legally cuts THROUGH the stadium. Until the mesh
 *  is re-exported without the bowl, reject routes that leave the endpoints'
 *  height band by more than this (a bowl crossing dips ~10u below both). */
const ROUTE_Y_BAND = 2.5;

/** Max walkable grade for a route segment (rise / horizontal run). Ramps and
 *  stairs sit around ~0.3; the seating-bowl slope is ~0.55+ — so routes that
 *  shortcut diagonally ACROSS the bowl between levels (inside the height band,
 *  invisible to the band check) get caught by their steepness instead. */
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

/**
 * Listens for double-click on the R3F canvas.
 * On each double-click (that wasn't preceded by a drag):
 *   1. Raycasts into the scene to find the 3D hit point.
 *   2. Finds the best navmesh zone for that point across all floors.
 *   3. Calls `navigateToFloor` to walk or teleport there.
 *
 * `navigateToFloor` is stored in an always-current ref so changes to it
 * never cause event listeners to be re-registered.
 */
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
  // Always-current ref — keeps listeners stable even if the callback changes
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

      // Convert screen coords → Normalized Device Coordinates (NDC)
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

      // Cross-floor walking is gone — portals handle inter-floor moves.
      // Restrict the floor search to the player's CURRENT floor so a click
      // on another floor's geometry can't path the player there.
      const currentZone = ctrl.getCurrentZone();
      const activeFloor = floors.find(f => zoneNameForFloor(f.id) === currentZone);
      const searchFloors = activeFloor ? [activeFloor] : floors;
      // Level/band/slope guards exist for POLLUTED navmeshes (memorial bowl).
      // Venues with a clean multi-level mesh (FloorConfig.routeSanitize false)
      // skip them — their ramp routes legitimately change level.
      const guardRoutes = activeFloor?.routeSanitize !== false;
      const match = findBestFloorForPoint(pt, searchFloors, pathfinding);
      if (!match) return;

      // Everything below snaps/clamps ONLY onto the PLAYER'S navmesh island
      // (pathfinding group). The nearest point on a DIFFERENT island has no
      // route to it — the walk then gets rejected and the click does nothing,
      // which reads as "navigation broken".
      const foot = ctrl.getFootPosition();
      const fromPt = new THREE.Vector3(foot.x, foot.y, foot.z);
      const playerGroup = pathfinding.getGroup(match.zoneName, fromPt) ?? 0;

      // On-mesh click (XZ inside a navmesh triangle at the clicked height) →
      // walk to the exact clicked point. Off-mesh click → walk to the NEAREST
      // navmesh point instead, capped at SNAP_MAX_DIST so sky/roof clicks do
      // nothing. Either way the walk paths through the navmesh.
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

      // Same-level only: the memorial navmesh (v1) covers the seating bowl and
      // stands, so an upper-stand target is "walkable" and the route climbs
      // straight through the stadium. A cross-level click isn't ignored — it
      // CLAMPS to the nearest walkable point on the player's level, so the
      // walk still heads toward the clicked spot as far as it validly can.
      if (guardRoutes && Math.abs(target.y - foot.y) > TARGET_MAX_DY) {
        const clamped = closestNavmeshPoint(
          pathfinding, match.zoneName, pt.x, foot.y, pt.z,
          foot.y - TARGET_MAX_DY, foot.y + TARGET_MAX_DY, playerGroup,
        );
        if (!clamped) return;
        target = new THREE.Vector3(clamped.x, clamped.y, clamped.z);
      }

      // Route sanity: on the bowl-covering mesh the "shortest" route between
      // far points dives ~10u through the stadium interior. Instead of
      // rejecting, TRUNCATE: walk the route only as far as it stays within the
      // endpoints' height band — the closest valid approach to the click.
      // Skipped when the venue's navmesh is clean (guardRoutes false).
      if (guardRoutes) try {
        const group = playerGroup;

        // Validate a candidate end point: route to it, then truncate at the
        // first waypoint that leaves the height band OR is reached via a
        // too-steep segment (the bowl slope) — both mean "through the bowl".
        // Returns the farthest valid end, or null when the route dives into
        // the bowl right at the start (nothing worth walking).
        const validateEnd = (tgt: THREE.Vector3): THREE.Vector3 | null => {
          // findPath demands BOTH endpoints be INSIDE a polygon (checkPolygon)
          // — and clamped/snapped targets often land exactly on a triangle
          // EDGE, so it returns null even though the point is on the island.
          // Mirror navigateToPoint: fall back to routing between the nearest
          // node CENTROIDS, which are always inside. Skipping validation on
          // null let bowl crossings through to the walker, which then
          // rejected them — a dead click.
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
            // rise > 0.8 skips ordinary stair steps; NO minimum run — the
            // broken connector triangles produce near-VERTICAL segments
            // (big rise, tiny run) that a run-gated check waved through.
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
          // The direct route dives into the bowl right away — NEVER ignore
          // the click (reads as "feature broken"). Re-aim at the nearest
          // navmesh point on the PLAYER's level toward the click and walk
          // the valid part of that route instead.
          const sameLevel = closestNavmeshPoint(
            pathfinding, match.zoneName, pt.x, foot.y, pt.z,
            foot.y - ROUTE_Y_BAND, foot.y + ROUTE_Y_BAND, playerGroup,
          );
          if (sameLevel) {
            const clamped = new THREE.Vector3(sameLevel.x, sameLevel.y, sameLevel.z);
            // If even this route trips the validator, hand the clamped point
            // to the walker anyway — navigateToPoint runs its own
            // sanitizeRoute truncation, so the walk stays safe but the click
            // still visibly moves the player toward the target.
            end = validateEnd(clamped) ?? clamped;
          }
        }
        if (!end) return;
        target = end;
      } catch { /* validation is best-effort — fall through to the walk */ }

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
    // navigateToFloor intentionally excluded — handled by always-current ref above
  }, [gl, enabled, navReady, floors, pathfinding, camera, raycaster, scene, playerControllerRef]);
}
