import * as THREE from "three";
import { gsap } from "gsap";
import type { PlayerState } from "../types";

interface TeleportOptions {
  state: PlayerState;
  camera: THREE.Camera;
  cameraHeight: number;
  stopNavigation: () => void;
}

export function buildTeleportFn({ state, camera, cameraHeight, stopNavigation }: TeleportOptions) {
  return (
    p: [number, number, number],
    r: [number, number, number],
    smooth = false,
  ) => {
    stopNavigation();
    state.transition.tween.current?.kill();
    state.pitchLock.current = false;

    const y = p[1] + cameraHeight;
    state.initPos.current.set(p[0], y, p[2]);

    if (smooth) {
      state.transition.start.current.copy(state.pos.current);
      state.transition.end.current.set(p[0], y, p[2]);
      state.transition.startYaw.current = state.rot.current.y;

      const raw   = r[1] - state.rot.current.y;
      const delta = ((raw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      state.transition.endYaw.current = state.rot.current.y + delta;

      const startPitch = state.rot.current.x;
      const startRoll  = state.rot.current.z;

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
          const t = state.transition.prog.current.t;
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
      state.snapped.current = true;
    }
  };
}
