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

  const { pendingLayoutEntryRef } = useScene();

  useEffect(() => {
    if (cinematicActive) return;
    if (prevFloor.current === activeFloor.id) return;
    if (!navReady) return;
    prevFloor.current = activeFloor.id;

    const newZone = zoneNameForFloor(activeFloor.id);

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

    const stickers = activeFloor.stickers;
    let stickerLookAt: { x: number; z: number } | null = null;
    if (stickers?.length) {
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
