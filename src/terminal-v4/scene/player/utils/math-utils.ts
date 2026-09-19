import * as THREE from "three";

/** Returns the yaw angle (radians) from point `a` toward point `b`. */
export function yaw(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
}

/** Interpolates between two angles via the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/**
 * Moves angle `a` toward `b` via the shortest arc at a fixed rate.
 * Unlike lerpAngle (exponential — fast start, slow finish), this advances
 * by exactly `maxDelta` radians per call, giving a constant-speed turn that
 * feels natural and never "snaps" regardless of the angular difference.
 */
export function lerpAngleClamp(a: number, b: number, maxDelta: number): number {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/** Pre-allocated look-ahead vector (avoids per-frame allocations). */
export const _ahead = new THREE.Vector3();
