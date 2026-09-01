"use client";

/**
 * The two euler orders `site.json` stores, and the conversions between them.
 *
 * This is the single thing most likely to be got wrong by hand, so nothing in
 * the studio writes a rotation without going through here.
 *
 *   layouts[].camera.rotation      XYZ — the order `/extract-pos` prints for a
 *   hotspots[].camera.rotation          `cp_NNN` node, and the order
 *   hotspots[].rotation                 `poseForCamera` expects to reorder.
 *
 *   cameras.dollhouse.rotation     YXZ — applied straight to the camera as
 *   cameras.spawn.rotation               `rotation.set(x, y, z, "YXZ")`, with
 *   cameras.firstPerson.rotation         no conversion in between.
 *
 * Read L04's `[3.1416, 0.4974, -3.1416]` as YXZ and the camera ends up upside
 * down looking the wrong way, which is exactly the class of bug an authoring
 * tool exists to make impossible. `config/index.ts` does the same arithmetic
 * without three.js so it stays importable anywhere; here three is already
 * loaded, so the conversion is a quaternion round-trip and cannot drift from
 * what the renderer does.
 */

import * as THREE from "three";
import type { CameraPose, LayoutCamera, Vec3 } from "@/config/schema";

/** Scratch — every function here is called from pointer handlers, not frames,
 *  but reusing keeps allocation out of the drag path. */
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _fwd = new THREE.Vector3();

export const round = (n: number, d = 4): number => {
  const k = 10 ** d;
  return Math.round(n * k) / k;
};

export const roundVec = (v: Vec3 | number[], d = 4): Vec3 =>
  [round(v[0], d), round(v[1], d), round(v[2], d)];

/** XYZ euler → the YXZ one a camera is set with. */
export function xyzToYxz(r: Vec3): Vec3 {
  _euler.set(r[0], r[1], r[2], "XYZ");
  _quat.setFromEuler(_euler);
  _euler.setFromQuaternion(_quat, "YXZ");
  return roundVec([_euler.x, _euler.y, _euler.z]);
}

/** YXZ euler → the XYZ one the layout/hotspot tables store. */
export function yxzToXyz(r: Vec3): Vec3 {
  _euler.set(r[0], r[1], r[2], "YXZ");
  _quat.setFromEuler(_euler);
  _euler.setFromQuaternion(_quat, "XYZ");
  return roundVec([_euler.x, _euler.y, _euler.z]);
}

/** The pose that looks from `position` at `target`, as a YXZ euler. Mirrors
 *  `poseLookingAt` in config/index.ts. */
export function poseLookingAt(position: Vec3, target: Vec3, eyeOffset = 0): CameraPose {
  const dx = target[0] - position[0];
  const dy = target[1] - (position[1] + eyeOffset);
  const dz = target[2] - position[2];
  const flat = Math.hypot(dx, dz);
  return {
    position,
    rotation: roundVec([Math.atan2(dy, flat), Math.atan2(-dx, -dz), 0]),
  };
}

/**
 * Resolve a `LayoutCamera` — authored either way — to the YXZ pose the runtime
 * applies. The studio's viewer flies to THIS, so what a user sees when they
 * click "preview" is what the terminal will show.
 *
 * Deliberately the same three branches as `poseForCamera` in config/index.ts,
 * in the same order.
 */
export function poseForCamera(camera: LayoutCamera, eyeOffset = 0): CameraPose {
  if (camera.rotation) return { position: camera.position, rotation: xyzToYxz(camera.rotation) };
  if (camera.target) return poseLookingAt(camera.position, camera.target, eyeOffset);
  return { position: camera.position, rotation: [0, 0, 0] };
}

/** Read a live three.js camera as a `CameraPose` — the YXZ form, for the
 *  `cameras.*` block. */
export function poseFromCamera(camera: THREE.Object3D): CameraPose {
  camera.getWorldQuaternion(_quat);
  _euler.setFromQuaternion(_quat, "YXZ");
  return {
    position: roundVec(camera.getWorldPosition(new THREE.Vector3()).toArray()),
    rotation: roundVec([_euler.x, _euler.y, _euler.z]),
  };
}

/** Read a live three.js camera as a `LayoutCamera` — the XYZ form, for the
 *  `layouts` / `hotspots` tables. */
export function layoutCameraFromCamera(camera: THREE.Object3D): LayoutCamera {
  camera.getWorldQuaternion(_quat);
  _euler.setFromQuaternion(_quat, "XYZ");
  return {
    position: roundVec(camera.getWorldPosition(new THREE.Vector3()).toArray()),
    rotation: roundVec([_euler.x, _euler.y, _euler.z]),
  };
}

/** Unit forward (-Z, the direction a three.js camera looks) for a YXZ pose. */
export function forwardOf(rotation: Vec3): THREE.Vector3 {
  _euler.set(rotation[0], rotation[1], rotation[2], "YXZ");
  _quat.setFromEuler(_euler);
  return _fwd.set(0, 0, -1).applyQuaternion(_quat).clone();
}

/**
 * Where OrbitControls should pivot so that seating the camera at `pose` reads
 * as "looking at something".
 *
 * OrbitControls has no notion of a rotation — it derives one from the camera
 * position and its target. So flying to an authored pose means putting the
 * target on the pose's own view ray, and the only open question is how far
 * along. `distance` is that answer, supplied by the caller from a raycast
 * against the model when there is a hit and from the model's size when there
 * is not.
 */
export function targetFor(pose: CameraPose, distance: number): Vec3 {
  const f = forwardOf(pose.rotation);
  return [
    pose.position[0] + f.x * distance,
    pose.position[1] + f.y * distance,
    pose.position[2] + f.z * distance,
  ];
}

/** True for a coordinate nothing has authored yet — same rule the runtime
 *  uses to suppress markers piled on the world origin. */
export function isPlaceholder(v: Vec3 | undefined): boolean {
  return !v || (v[0] === 0 && v[1] === 0 && v[2] === 0);
}

export const DEG = 180 / Math.PI;
export const toDeg = (rad: number) => round(rad * DEG, 2);
export const toRad = (deg: number) => round(deg / DEG, 6);
