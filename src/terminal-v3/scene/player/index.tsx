"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";

import { usePlayerState }        from "./hooks/use-player-state";
import { usePathfinding }        from "./hooks/use-pathfinding";
import { useNavmeshSnap }        from "./hooks/use-navmesh-snap";
import { useWalkFrame }          from "./hooks/use-walk-frame";
import { usePointerDrag }        from "./hooks/use-pointer-drag";
import { useRoomZoneDetection }  from "./hooks/use-room-zone-detection";
import { buildTeleportFn }       from "./utils/teleport";
import { probeFloorY }           from "./utils/probe-floor-y";
import { navConfig }             from "../../navigation-config";
import type { RoomZone }         from "../navmesh/geometry";
import type { PlayerControllerHandle, PlayerControllerProps } from "./types";

export type { PlayerControllerHandle };

export const PlayerController = forwardRef<PlayerControllerHandle, PlayerControllerProps>(
  (
    {
      enabled = true,
      lookEnabled = false,
      speed = 2.5,
      cameraHeight = 1.7,
      startPosition = [0, 0, 0],
      startRotation = [0, 0, 0],
      pathfinding,
      initialZone,
      onMovingChange,
      onZoneChange,
      roomZonesMap,
      onRoomChange,
      routeSanitize = true,
      debug = false,
    },
    ref,
  ) => {
    const { camera, gl, scene } = useThree();

    const state = usePlayerState({ startPosition, startRotation, cameraHeight, initialZone });

    const skipFirstIdleRef = useRef(true);

    const onMovingChangeRef = useRef(onMovingChange);
    useLayoutEffect(() => { onMovingChangeRef.current = onMovingChange; });

    const onRoomChangeRef = useRef(onRoomChange);
    useLayoutEffect(() => { onRoomChangeRef.current = onRoomChange; });

    const emptyMapRef = useRef<Map<string, RoomZone[]>>(new Map());

    const setMoving = useCallback((v: boolean) => {
      state.moving.current = v;
      onMovingChangeRef.current?.(v);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { navigateToPoint, stopNavigation, previewTo, clearPreview, measurePathTo, measurePathsTo } = usePathfinding({
      state, pathfinding, cameraHeight, setMoving, routeSanitize, debug,
    });

    const teleportTo = buildTeleportFn({ state, camera, cameraHeight, stopNavigation });

    useNavmeshSnap({ state, enabled, pathfinding, cameraHeight, camera });
    usePointerDrag({ gl, state });
    useWalkFrame({
      prevEnabled:   state.prevEnabled,
      idleOn:        state.idleOn,
      idleAcc:       state.idleAcc,
      pos:           state.pos,
      rot:           state.rot,
      yawT:          state.yawT,
      moving:        state.moving,
      path:          state.path,
      pathI:         state.pathI,
      speedMult:     state.speedMult,
      transition:    state.transition,
      targetY:       state.targetY,
      currentZone:   state.currentZone,
      onNavComplete: state.onNavComplete,
      vizGrp:        state.vizGrp,
      skipFirstIdle: skipFirstIdleRef,
      enabled, lookEnabled, speed, cameraHeight, camera, setMoving, pathfinding,
    });

    const stableOnRoomChange = useCallback((id: string | null) => {
      onRoomChangeRef.current?.(id);
    }, []);

    useRoomZoneDetection({
      pos:          state.pos,
      currentZone:  state.currentZone,
      enabled,
      roomZonesMap: roomZonesMap ?? emptyMapRef,
      onRoomChange: stableOnRoomChange,
    });

    useImperativeHandle(ref, () => ({
      navigateToPoint: (pos, targetZone, onDone) => {
        // A committed walk supersedes any preview route — and any fly-over
        // yaw-only look lock (walking resumes normal ground look control).
        clearPreview();
        state.pitchLock.current = false;
        return navigateToPoint(pos, targetZone, onDone);
      },
      stopNavigation,
      measurePathTo,
      measurePathsTo,
      previewTo,
      clearPreview,
      getPreviewPath3D: () =>
        state.previewPath.current.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      teleportTo,
      probeFloorY: (x, z, expectedY) =>
        probeFloorY(pathfinding, state.currentZone.current, x, z, expectedY),
      nearestNavPoint: (pos) => {
        const zone = state.currentZone.current;
        const fp = new THREE.Vector3(
          pos?.x ?? state.pos.current.x,
          pos?.y ?? (state.pos.current.y - cameraHeight),
          pos?.z ?? state.pos.current.z,
        );
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const z = (pathfinding as any).zones?.[zone];
          if (!z) return null;
          const groups: number = z.groups?.length ?? 0;
          let best = null as null | { x: number; y: number; z: number; dist: number };
          for (let g = 0; g < groups; g++) {
            const node = pathfinding.getClosestNode(fp, zone, g);
            if (!node) continue;
            const c = node.centroid;
            const d = Math.hypot(c.x - fp.x, c.y - fp.y, c.z - fp.z);
            if (!best || d < best.dist) best = { x: c.x, y: c.y, z: c.z, dist: d };
          }
          return best;
        } catch { return null; }
      },
      isMoving:    () => state.moving.current,
      getPosition: () => ({ x: state.pos.current.x, y: state.pos.current.y, z: state.pos.current.z }),
      getRotationY: () => state.rot.current.y,
      getPath:     () => state.path.current.slice(state.pathI.current).map(p => ({ x: p.x, z: p.z })),
      getPath3D:   () => state.path.current.slice(state.pathI.current).map(p => ({ x: p.x, y: p.y, z: p.z })),
      getFootPosition: () => ({ x: state.pos.current.x, y: state.pos.current.y - cameraHeight, z: state.pos.current.z }),
      getSpeed:    () => speed * state.speedMult.current,
      getMetersPerUnit: () => navConfig.logic.realEyeHeightM / cameraHeight,
      getCurrentZone: () => state.currentZone.current,
      setCurrentZone: (z: string) => { state.currentZone.current = z; onZoneChange?.(z); },
      setOnNavigationComplete: (cb) => { state.onNavComplete.current = cb; },
      setSpeedMultiplier: (v: number) => { state.speedMult.current = v; },
      getSpeedMultiplier: () => state.speedMult.current,
      setPitchLock: (v: boolean) => { state.pitchLock.current = v; },
      resetToStart: () => {
        stopNavigation();
        state.pos.current.copy(state.initPos.current);
        state.targetY.current = state.initPos.current.y;
        state.rot.current.set(...startRotation);
        state.yawT.current = startRotation[1];
      },
      startIdleDrift: () => {
        state.idleOn.current  = true;
        state.idleAcc.current = 0;
      },
      lookAtPoint: (target) => {
        const dx = target.x - state.pos.current.x;
        const dz = target.z - state.pos.current.z;
        const targetYaw = Math.atan2(dx, dz) + Math.PI;

        const TAU = Math.PI * 2;
        let arc = targetYaw - state.rot.current.y;
        arc = ((arc + Math.PI * 3) % TAU) - Math.PI;
        const endYaw = state.rot.current.y + arc;

        state.lookAtTween.current?.kill();
        state.lookAtTween.current = gsap.to(state.rot.current, {
          y: endYaw,
          duration: 0.7,
          ease: "power2.out",
          onUpdate: () => {
            state.yawT.current = state.rot.current.y;
          },
          onComplete: () => {
            state.lookAtTween.current = null;
          },
        });
        state.idleOn.current = false;
      },
      captureScreenshot: (download = false) => {
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL("image/png");
        if (download) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `screenshot-${Date.now()}.png`;
          a.click();
        }
        return url;
      },
    }));

    useEffect(() => {
      const y = startPosition[1] + cameraHeight;
      stopNavigation();
      state.pos.current.set(startPosition[0], y, startPosition[2]);
      state.targetY.current = y;
      state.initPos.current.set(startPosition[0], y, startPosition[2]);
      state.rot.current.set(startRotation[0], startRotation[1], startRotation[2]);
      state.yawT.current = startRotation[1];
      state.snapped.current = false;
      camera.position.set(startPosition[0], y, startPosition[2]);
      camera.rotation.set(startRotation[0], startRotation[1], startRotation[2], "YXZ");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera, cameraHeight, startPosition, startRotation]);

    return <group ref={state.vizGrp} />;
  },
);

PlayerController.displayName = "PlayerController";
