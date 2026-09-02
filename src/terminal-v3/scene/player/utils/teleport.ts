import * as THREE from "three";
import { gsap } from "gsap";
import type { PlayerState } from "../types";

interface TeleportOptions {
  state: PlayerState;
  camera: THREE.Camera;
  cameraHeight: number;
  stopNavigation: () => void;
}

/**
 * Returns a `teleportTo` function bound to the given player state.
 *
 * - **smooth=false** (default): instant snap — moves camera immediately.
 * - **smooth=true**: GSAP-driven 0.55s ease — interpolates position and yaw
 *   via `state.transition` refs; `useWalkFrame` reads these each tick.
 */
export function buildTeleportFn({ state, camera, cameraHeight, stopNavigation }: TeleportOptions) {
  return (
    p: [number, number, number],
    r: [number, number, number],
    smooth = false,
  ) => {
    stopNavigation();
    state.transition.tween.current?.kill();
    // Every teleport resets the fly-over yaw-only look lock; the caller
    // re-arms it (setPitchLock) when the destination is a fly pose.
    state.pitchLock.current = false;

    const y = p[1] + cameraHeight;
    state.initPos.current.set(p[0], y, p[2]);

    if (smooth) {
      // Snapshot current state; useWalkFrame interpolates while prog.t → 1
      state.transition.start.current.copy(state.pos.current);
      state.transition.end.current.set(p[0], y, p[2]);
      state.transition.startYaw.current = state.rot.current.y;

      // Shortest-arc yaw delta (never spins the wrong way)
      const raw   = r[1] - state.rot.current.y;
      const delta = ((raw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      state.transition.endYaw.current = state.rot.current.y + delta;

      // Pitch/roll ride the SAME eased tween as yaw (via onUpdate below) —
      // snapping rot.x here jolted the view vertically the instant a walk
      // arrived at a destination with authored pitch (seat views look down,
      // info desks look slightly up). Roll is virtually always 0 but is
      // interpolated too for consistency.
      const startPitch = state.rot.current.x;
      const startRoll  = state.rot.current.z;

      // Duration scales with how far there is to TURN (yaw and pitch), so a
      // near-180° arrival turn sweeps at a comfortable rate instead of
      // whipping around in the fixed 0.55s — the "final turn is jerky"
      // arrival. Position-only settles keep the quick 0.55s.
      const duration = Math.min(
        1.6,
        Math.max(0.55, Math.abs(delta) / 2.2, Math.abs(r[0] - startPitch) / 1.8),
      );

      state.transition.prog.current.t  = 0;
      state.transition.active.current  = true;

      state.transition.tween.current = gsap.to(state.transition.prog.current, {
        t: 1,
        duration,
        ease: "power2.inOut",
        onUpdate: () => {
          const t = state.transition.prog.current.t; // already eased
          state.rot.current.x = startPitch + (r[0] - startPitch) * t;
          state.rot.current.z = startRoll  + (r[2] - startRoll)  * t;
        },
        onComplete: () => {
          state.pos.current.copy(state.transition.end.current);
          state.targetY.current           = y;
          state.rot.current.x             = r[0];
          state.rot.current.y             = r[1];
          state.rot.current.z             = r[2];
          state.yawT.current              = r[1];
          state.transition.active.current = false;
          state.snapped.current           = true;
        },
      });
    } else {
      state.transition.active.current = false;
      state.pos.current.set(p[0], y, p[2]);
      state.targetY.current = y;
      state.rot.current.set(r[0], r[1], r[2]);
      state.yawT.current = r[1];
      camera.position.set(p[0], y, p[2]);
      camera.rotation.set(r[0], r[1], r[2], "YXZ");
      // Mark as snapped so useNavmeshSnap doesn't re-run on the next
      // `enabled` flip (e.g. after a portal cinematic). The caller has
      // already chosen the correct Y for this teleport (config Y for
      // cinematic landings, probeFloorY-derived for layouts/home), so
      // re-snapping to the nearest-centroid Y would only shift it again.
      state.snapped.current = true;
    }
  };
}
