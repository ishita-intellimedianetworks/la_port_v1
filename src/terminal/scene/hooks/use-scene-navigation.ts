"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { FloorConfig } from "@/shared/types";
import type { PlayerControllerHandle } from "../player";
import { zoneNameForFloor } from "../navmesh";
import { useDoubleClickNav } from "./use-double-click-nav";
import { useScene } from "../../context/scene-context";
import { useNavUiStore } from "../../stores/nav-ui-store";

interface UseSceneNavigationOptions {
  floors: FloorConfig[];
  pathfinding: Pathfinding;
  navReady: boolean;
  dblClickEnabled: boolean;
  /**
   * When true, a portal cinematic is in progress. All auto-behaviours
   * (floor-detect useFrame, activeFloor auto-teleport) are suppressed —
   * the cinematic owns the camera + zone + floor index until it completes.
   */
  cinematicActive: boolean;
  playerControllerRef: RefObject<PlayerControllerHandle | null>;
  activeFloor: FloorConfig;
  setActiveFloorIndex: (i: number) => void;
  setNavigateFromMinimap: (fn: (x: number, z: number) => void) => void;
  /** Floor-selector blackout: fade to black, run swap callback at peak, fade back. */
  triggerFloorTransition: (
    onBlack: () => void,
    opts?: { waitForModel?: boolean; expectedKey?: string },
  ) => void;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  cameraHeight: number;
  gl: { domElement: HTMLElement };
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  scene: THREE.Scene;
}

/**
 * Manages all navigation concerns for SceneContent:
 * - Floor auto-detect from player position (feet-Y, hysteresis, idle-aware)
 * - UI floor selector → blackout + teleport on the destination zone
 * - Same-floor walk / cross-floor MERGED_ZONE walk / teleport fallback
 * - Minimap click navigation (restricted to the active floor's zone)
 * - Double-click raycast navigation
 *
 * Returns `handleZoneChange` for use as PlayerController's `onZoneChange` prop.
 */
export function useSceneNavigation({
  floors,
  pathfinding,
  navReady,
  dblClickEnabled,
  cinematicActive,
  playerControllerRef,
  activeFloor,
  setActiveFloorIndex,
  setNavigateFromMinimap,
  startPosition,
  startRotation,
  gl,
  camera,
  raycaster,
  scene,
}: UseSceneNavigationOptions) {
  const prevFloor = useRef(activeFloor.id);
  // Cross-floor walking is removed. The auto floor-detect useFrame that used
  // to live here was only meaningful when multiple zones coexisted; with a
  // single active navmesh it can only ever match the current floor, so the
  // per-frame scan is pure waste. Floor changes now go exclusively through
  // the FloorTransitionPortal cinematic and the UI selector.

  // Navigation: SAME-FLOOR ONLY
  // Only one floor's navmesh exists at a time, so all walks are confined to
  // the active floor. Floor transitions happen exclusively via the
  // FloorTransitionPortal cinematic. A single A* pass in the player's
  // current zone — navigateToPoint handles its own off-mesh-start fallback.
  const navigateToFloor = useCallback((
    ctrl: PlayerControllerHandle,
    pt: THREE.Vector3,
    zoneName: string,
  ) => {
    if (zoneName !== ctrl.getCurrentZone()) return;
    // Map clicks + 3D double-clicks both route through here — these are "manual"
    // walks, so suppress the turn HUD (only label/directions Start raises it).
    useNavUiStore.getState().setNavHud(false);
    ctrl.navigateToPoint({ x: pt.x, y: pt.y, z: pt.z });
  }, []);

  const handleZoneChange = useCallback((newZone: string) => {
    const idx = floors.findIndex(f => zoneNameForFloor(f.id) === newZone);
    if (idx >= 0 && floors[idx].id !== prevFloor.current) {
      prevFloor.current = floors[idx].id;
      setActiveFloorIndex(idx);
    }
  }, [floors, setActiveFloorIndex]);

  // Floor switch via UI selector — teleport only (blackout is owned by HTML tree)
  // triggerFloorTransition is called by handleFloorSelect in TerminalExperience (HTML tree)
  // BEFORE setActiveFloorIndex fires. By the time activeFloor changes here, the screen
  // is already black, so we just teleport the player and the HTML tree fades back out.
  // Skipped during a portal cinematic: the cinematic itself changes
  // activeFloorIndex at fade peak and owns the post-swap teleport. Running
  // this effect on top would fight the cinematic for the player's pose.
  const { pendingLayoutEntryRef } = useScene();

  useEffect(() => {
    if (cinematicActive) return;
    if (prevFloor.current === activeFloor.id) return;
    // Wait until the new floor's navmesh has registered its zone — otherwise
    // setCurrentZone + the floor-Y snap below would target a non-existent
    // zone and the player would land floating.
    if (!navReady) return;
    prevFloor.current = activeFloor.id;

    const newZone = zoneNameForFloor(activeFloor.id);

    // If a cross-floor layout click is in flight and we just arrived at the
    // destination floor, land at the LAYOUT's authored pose instead of the
    // floor's default startPosition. The ref is then cleared so subsequent
    // floor switches fall back to the default behaviour.
    const pending = pendingLayoutEntryRef.current;
    const usePendingLayout = !!pending && pending.floorId === activeFloor.id;
    if (usePendingLayout) pendingLayoutEntryRef.current = null;

    const p = (usePendingLayout
      ? pending!.position
      : (activeFloor.startPosition ?? startPosition ?? [0, 0, 0])) as [number, number, number];
    const r = (usePendingLayout
      ? pending!.rotation
      : (activeFloor.startRotation ?? startRotation ?? [0, 0, 0])) as [number, number, number];

    const ctrl = playerControllerRef.current;
    if (!ctrl) return;

    ctrl.stopNavigation();
    ctrl.setCurrentZone(newZone);

    // Snap Y to the navmesh surface on the new floor — the configured Y may
    // not perfectly match the navmesh mesh height, causing the player to float.
    const snappedP: [number, number, number] = [p[0], p[1], p[2]];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((pathfinding as any).zones?.[newZone]) {
        const fp = new THREE.Vector3(p[0], p[1], p[2]);
        const g = pathfinding.getGroup(newZone, fp);
        if (g !== null) {
          const node = pathfinding.getClosestNode(fp, newZone, g);
          if (node) snappedP[1] = node.centroid.y;
        }
      }
    } catch { /* zone not yet registered — use config Y */ }

    ctrl.teleportTo(snappedP, r);
  }, [activeFloor, startPosition, startRotation, playerControllerRef, pathfinding, floors, cinematicActive, navReady, pendingLayoutEntryRef]);

  // Minimap click navigation
  // The minimap is a top-down projection of the active floor's navmesh, so a
  // click carries only an XZ intent — there is no Y to read off. The previous
  // implementation routed the click through findBestFloorForPoint, which scores
  // candidates by FULL 3D distance from `(x, feetY, z)`. That biases against
  // stair nodes: a stair triangle sits at Y > feetY, so a regular floor node
  // a metre away in XZ but at dy=0 always beats the stair node directly under
  // the cursor (dy ≈ step-height × N). The visible symptom is "clicking on
  // stairs walks me beside them instead of up them".
  // Fix: search by XZ distance only, against the active floor's zone. Tie-break
  // (≤ 1 cm in XZ) by picking the HIGHER Y, because where the click XZ stacks
  // two triangles — typically the floor under a staircase landing — the upper
  // tri is what the user sees drawn on top of the minimap and is what they
  // mean to navigate to. Then we feed the chosen node's full 3D centroid into
  // navigateToPoint, so the internal getClosestNode call there picks the same
  // node by 3D distance (now that target.y matches stair Y, not feet Y).
  const navigateFromMinimap = useCallback((x: number, z: number) => {
    const ctrl = playerControllerRef.current;
    if (!ctrl || !navReady) return;

    const zone = zoneNameForFloor(activeFloor.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zoneData = (pathfinding as any).zones?.[zone];
    if (!zoneData) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups: any[][] = zoneData.groups ?? [];
    let bestDXZ = Infinity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bestNode: any = null;
    const TIE_EPS = 0.01;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      for (let i = 0; i < group.length; i++) {
        const node = group[i];
        const dx = node.centroid.x - x;
        const dz = node.centroid.z - z;
        const dXZ = Math.sqrt(dx * dx + dz * dz);
        if (dXZ < bestDXZ - TIE_EPS) {
          bestDXZ = dXZ;
          bestNode = node;
        } else if (
          bestNode &&
          Math.abs(dXZ - bestDXZ) <= TIE_EPS &&
          node.centroid.y > bestNode.centroid.y
        ) {
          bestDXZ = dXZ;
          bestNode = node;
        }
      }
    }
    if (!bestNode) return;

    const target = new THREE.Vector3(
      bestNode.centroid.x,
      bestNode.centroid.y,
      bestNode.centroid.z,
    );

    // Stair stickers: rotate to face the lookAt target on arrival
    // When a click lands within ~0.8m of a sticker that has `lookAt`, the
    // sticker is treated as a stair point — after the walk completes, the
    // player turns (yaw only) to face the lookAt XZ. The existing yaw lerp
    // animates the rotation; no extra animation code needed.
    // Must run AFTER navigateToFloor: navigateToPoint resets onNavComplete to
    // its `onDone` arg (null here), so setting the callback first would lose it.
    const stickers = activeFloor.stickers;
    let stickerLookAt: { x: number; z: number } | null = null;
    if (stickers?.length) {
      // World-space click tolerance. 0.8 m worked on desktop but on the
      // 170 px mobile minimap a 5-10 px fingertip offset translates to
      // ~1-2 m world (bounds ≈ 30 m / 170 px ≈ 0.18 m/px). 1.5 m gives a
      // forgiving touch target while still being narrow enough not to
      // capture clicks meant for unrelated points further away.
      const STAIR_CLICK_RADIUS = 1.5;
      let nearestDXZ = Infinity;
      for (const s of stickers) {
        if (!s.lookAt) continue;
        const dx = s.x - x;
        const dz = s.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d <= STAIR_CLICK_RADIUS && d < nearestDXZ) {
          nearestDXZ = d;
          stickerLookAt = s.lookAt;
        }
      }
    }

    navigateToFloor(ctrl, target, zone);
    if (stickerLookAt) {
      const lookAt = stickerLookAt;
      ctrl.setOnNavigationComplete(() => ctrl.lookAtPoint(lookAt));
    }
  }, [playerControllerRef, navReady, pathfinding, navigateToFloor, activeFloor.id, activeFloor.stickers]);

  useEffect(() => {
    setNavigateFromMinimap(navigateFromMinimap);
  }, [navigateFromMinimap, setNavigateFromMinimap]);

  useDoubleClickNav({ gl, camera, raycaster, scene, navReady, enabled: dblClickEnabled, floors, pathfinding, playerControllerRef, navigateToFloor });

  return { handleZoneChange };
}
