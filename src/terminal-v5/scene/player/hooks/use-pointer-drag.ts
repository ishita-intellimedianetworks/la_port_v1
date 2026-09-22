import { useEffect } from "react";
import { PITCH_MIN, PITCH_MAX } from "../utils/constants";
import type { PlayerState } from "../types";

interface UsePointerDragOptions {
  gl: { domElement: HTMLElement };
  state: PlayerState;
}

export function usePointerDrag({ gl, state }: UsePointerDragOptions) {
  useEffect(() => {
    const dom     = gl.domElement;
    let armed     = false;
    let dragging  = false;
    let lastMX    = 0;
    let lastMY    = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      armed = true;
      state.idleOn.current = false;
      state.lookAtTween.current?.kill();
      state.lookAtTween.current = null;
      dragging = false;
      lastMX   = e.clientX;
      lastMY   = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!armed || e.buttons !== 1) return;
      const dx = e.clientX - lastMX;
      const dy = e.clientY - lastMY;
      if (!dragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) dragging = true;
      if (dragging && !state.moving.current) {
        state.rot.current.y -= dx * 0.005;
        state.yawT.current   = state.rot.current.y;
        if (!state.pitchLock.current) {
          state.rot.current.x = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.rot.current.x - dy * 0.004));
        }
      }
      lastMX = e.clientX;
      lastMY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      armed = false;
      dragging = false;
      dom.releasePointerCapture?.(e.pointerId);
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup",   onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup",   onUp);
    };
  }, [gl, state.idleOn, state.moving, state.rot, state.yawT]);
}
