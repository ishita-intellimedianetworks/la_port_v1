"use client";

/**
 * PlayerController
 * ─────────────────────────────────────────────────────────────────────────────
 * First-person player controller for the interior walkthrough. Exposes an
 * imperative handle (PlayerControllerHandle) via forwardRef so the parent
 * TerminalExperience shell can drive navigation without causing re-renders.
 *
 *   usePlayerState      : creates all mutable refs (position, rotation, path,
 *                         transition, idle flags) grouped as PlayerState
 *   usePathfinding      : navigateToPoint / stopNavigation via three-pathfinding
 *   buildTeleportFn     : instant snap or GSAP-driven smooth floor transition
 *   useNavmeshSnap      : one-shot Y-snap to navmesh surface on mount
 *   usePointerDrag      : left-drag → yaw/pitch look around
 *   useWalkFrame        : per-frame walk along path, floor Y lerp, camera sync
 *
 * eslint-disable react-hooks/immutability: intentional — this component's job
 * is to mutate shared state refs in callbacks and the animation loop.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useThree } from "@react-three/fiber";
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

    // ── All mutable state in one place ────────────────────────────────────────
    const state = usePlayerState({ startPosition, startRotation, cameraHeight, initialZone });

    // Idle drift is gated externally — TerminalExperience calls startIdleDrift() after reveal
    const skipFirstIdleRef = useRef(true);

    // Always-current refs for callbacks so inner functions never re-create
    const onMovingChangeRef = useRef(onMovingChange);
    useLayoutEffect(() => { onMovingChangeRef.current = onMovingChange; });

    const onRoomChangeRef = useRef(onRoomChange);
    useLayoutEffect(() => { onRoomChangeRef.current = onRoomChange; });

    // Stable empty fallback so useRoomZoneDetection can always read a map
    const emptyMapRef = useRef<Map<string, RoomZone[]>>(new Map());

    const setMoving = useCallback((v: boolean) => {
      state.moving.current = v;
      onMovingChangeRef.current?.(v);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Focused hooks ─────────────────────────────────────────────────────────
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

    // ── Imperative handle (public API surface) ────────────────────────────────
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
      isMoving:    () => state.moving.current,
      getPosition: () => ({ x: state.pos.current.x, y: state.pos.current.y, z: state.pos.current.z }),
      getRotationY: () => state.rot.current.y,
      getPath:     () => state.path.current.slice(state.pathI.current).map(p => ({ x: p.x, z: p.z })),
      getPath3D:   () => state.path.current.slice(state.pathI.current).map(p => ({ x: p.x, y: p.y, z: p.z })),
      getFootPosition: () => ({ x: state.pos.current.x, y: state.pos.current.y - cameraHeight, z: state.pos.current.z }),
      getSpeed:    () => speed * state.speedMult.current,
      // Avatar eye height (cameraHeight, world units) maps to a real ~1.6 m, so
      // 1 world unit ≈ realEyeHeightM / cameraHeight metres. Lets the HUD/minimap
      // show a realistic walking time instead of the (much faster) camera fly
      // time. Tune realEyeHeightM in nav-config.ts.
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
        // Yaw-only rotation. Y is intentionally ignored: the camera stays
        // level and just turns horizontally toward the target's XZ.
        //
        // Implementation: a GSAP tween animates rot.y over a fixed wall-clock
        // duration with an ease-out curve. This is frame-rate independent —
        // settles in the same real time on both PC and phones (the previous
        // per-frame exponential lerp dragged out + stuttered visibly on
        // mobile where the dt clamp produced chunky per-frame jumps).
        // yawT is kept in lockstep via onUpdate so the walk-frame's idle
        // yaw lerp does nothing while the tween is active.
        const dx = target.x - state.pos.current.x;
        const dz = target.z - state.pos.current.z;
        const targetYaw = Math.atan2(dx, dz) + Math.PI;

        // Pick the shortest signed arc to the target so the tween rotates the
        // smart way around (otherwise a 359° turn instead of -1° would happen
        // whenever the angles straddle the ±π wrap).
        const TAU = Math.PI * 2;
        let arc = targetYaw - state.rot.current.y;
        arc = ((arc + Math.PI * 3) % TAU) - Math.PI;
        const endYaw = state.rot.current.y + arc;

        // Kill any in-flight tween so consecutive lookAt calls don't queue.
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
        // Cancel intro drift; it would advance yawT and fight the tween.
        state.idleOn.current = false;
      },
      captureScreenshot: (download = false) => {
        // Render once into the backbuffer immediately before reading it —
        // works without preserveDrawingBuffer because toDataURL runs in the
        // same tick as the render, before the buffer is cleared on present.
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

    // ── Seat the player at startPosition on mount AND whenever the start pose
    // changes (a venue swap passes the NEW floor's start). The controller
    // persists across floor swaps, so setting only the camera here left the
    // player state at the OLD venue's position — the next frame snapped the
    // camera right back. Reset the full pose (pos/rot/targets) so every venue
    // change lands at its authored start.
    useEffect(() => {
      const y = startPosition[1] + cameraHeight;
      stopNavigation();
      state.pos.current.set(startPosition[0], y, startPosition[2]);
      state.targetY.current = y;
      state.initPos.current.set(startPosition[0], y, startPosition[2]);
      state.rot.current.set(startRotation[0], startRotation[1], startRotation[2]);
      state.yawT.current = startRotation[1];
      // Let the one-shot navmesh Y-snap re-run against the NEW floor's mesh.
      state.snapped.current = false;
      camera.position.set(startPosition[0], y, startPosition[2]);
      camera.rotation.set(startRotation[0], startRotation[1], startRotation[2], "YXZ");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camera, cameraHeight, startPosition, startRotation]);

    return <group ref={state.vizGrp} />;
  },
);

PlayerController.displayName = "PlayerController";
