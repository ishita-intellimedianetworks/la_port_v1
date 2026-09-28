import * as THREE from "three";

export function yaw(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function lerpAngleClamp(a: number, b: number, maxDelta: number): number {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

export const _ahead = new THREE.Vector3();
