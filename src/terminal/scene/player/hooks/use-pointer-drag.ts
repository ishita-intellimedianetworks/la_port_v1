/**
 * usePointerDrag
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches pointer listeners to the R3F canvas for first-person look control:
 *   - Left-button drag while NOT walking → yaw (horizontal) + pitch (vertical)
 *   - Pointer-down cancels any active idle drift rotation
 * Drag threshold (5 px) prevents micro-movements registering as a camera turn.
 * Pitch is clamped to [PITCH_MIN, PITCH_MAX] so the player can't flip upside-down.
 */
import { useEffect } from "react";
import { PITCH_MIN, PITCH_MAX } from "../utils/constants";
import type { PlayerState } from "../types";

interface UsePointerDragOptions {
  gl: { domElement: HTMLElement };
  state: PlayerState;
}

/**
 * Listens for pointer drag on the canvas to rotate the camera.
 * - Left-button drag while NOT walking → yaw + pitch
 * - Cancels idle rotation on pointer-down
 */
export function usePointerDrag({ gl, state }: UsePointerDragOptions) {
  useEffect(() => {
    const dom     = gl.domElement;
    // `armed` is set ONLY by a press that lands on the scene canvas. onMove
    // rotates only while armed, so a drag begun elsewhere (the map window's
    // resize / pan, a UI button) can never rotate the player even if the pointer
    // strays over the exposed scene — while a drag begun on the scene still works
    // normally, even with the map open.
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
        // Fly-over pose: yaw-only — the pitch stays frozen (straight down) so
        // the drag spins the aerial view without tilting it off-axis.
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
