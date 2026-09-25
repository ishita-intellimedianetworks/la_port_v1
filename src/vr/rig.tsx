"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { useWorldStore } from "@/shared/stores/world-store";
import { useVrBridge, type VrView } from "./bridge";

export const VR_LOCOMOTION = {
  walkUnitsPerSecond: 3,
  runMultiplier: 4,
  deadzone: 0.15,
  snapTurnRadians: THREE.MathUtils.degToRad(30),
  snapEngage: 0.6,
  snapRelease: 0.3,
  jumpUnits: 2,
  jumpYaw: 0.2,
  orbitRadiansPerSecond: THREE.MathUtils.degToRad(60),
  orbitNear: 0.6,
  orbitFallbackUnits: 300,
  orbitMinUnits: 20,
  orbitMaxUnits: 4000,
} as const;

type Pose = { x: number; y: number; z: number; yaw: number };
type Followed = Pose & { foot: number; view: VrView };

const UP = new THREE.Vector3(0, 1, 0);
const _head = new THREE.Vector3();
const _local = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _step = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _look = new THREE.Vector3();

type Orbit = { px: number; py: number; pz: number; anchor: THREE.Vector3; centred: boolean };

function orbitPivot(pose: { position: number[]; rotation: number[] }, groundY: number) {
  const [x, y, z] = pose.position;
  _euler.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], "YXZ");
  _look.set(0, 0, -1).applyEuler(_euler);
  const reach =
    _look.y < -0.05
      ? THREE.MathUtils.clamp((y - groundY) / -_look.y, VR_LOCOMOTION.orbitMinUnits, VR_LOCOMOTION.orbitMaxUnits)
      : VR_LOCOMOTION.orbitFallbackUnits;
  return { x: x + _look.x * reach, z: z + _look.z * reach };
}

function rotateAbout(next: Pose, px: number, pz: number, angle: number) {
  const moved = new THREE.Vector3(next.x - px, 0, next.z - pz).applyAxisAngle(UP, angle);
  next.x = moved.x + px;
  next.z = moved.z + pz;
  next.yaw += angle;
}

function axis(v: number | undefined) {
  const x = v ?? 0;
  return Math.abs(x) < VR_LOCOMOTION.deadzone ? 0 : x;
}

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function VrRig() {
  const bridge = useVrBridge();
  const bridgeRef = useRef(bridge);
  useLayoutEffect(() => {
    bridgeRef.current = bridge;
  });

  const gl = useThree((s) => s.gl);
  const session = useXR((s) => s.session);
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");

  const base = useRef<XRReferenceSpace | null>(null);
  const applied = useRef<Pose>({ x: 0, y: 0, z: 0, yaw: 0 });
  const followed = useRef<Followed | null>(null);
  const snapArmed = useRef(true);
  const orbit = useRef<Orbit | null>(null);

  useEffect(() => {
    const xrCamera = gl.xr.getCamera();
    base.current = null;
    followed.current = null;
    applied.current = { x: 0, y: 0, z: 0, yaw: 0 };
    if (!session) return;
    xrCamera.matrixAutoUpdate = false;
    return () => {
      xrCamera.matrixAutoUpdate = true;
      gl.xr.setReferenceSpace(null as unknown as XRReferenceSpace);
    };
  }, [session, gl]);

  useFrame((state, delta) => {
    if (!session) return;
    if (!base.current) base.current = gl.xr.getReferenceSpace();
    const space = base.current;
    if (!space) return;
    const br = bridgeRef.current;

    const cur = applied.current;
    state.camera.matrix.decompose(_head, _quat, _scale);
    const worldYaw = _euler.setFromQuaternion(_quat, "YXZ").y;
    _local.set(_head.x - cur.x, 0, _head.z - cur.z).applyAxisAngle(UP, -cur.yaw);
    const localY = _head.y - cur.y;
    const localYaw = worldYaw - cur.yaw;

    const ctrl = br.view === "firstPerson" ? br.controller() : null;
    let target: Followed | null = null;
    if (ctrl) {
      const p = ctrl.getPosition();
      target = { x: p.x, y: p.y, z: p.z, yaw: ctrl.getRotationY(), foot: ctrl.getFootPosition().y, view: "firstPerson" };
    } else if (br.view === "dollhouse" && br.dollhousePose) {
      const [x, y, z] = br.dollhousePose.position;
      const held = followed.current?.view === "dollhouse" ? followed.current.foot : y - localY;
      target = { x, y, z, yaw: br.dollhousePose.rotation[1], foot: held, view: "dollhouse" };
    }
    if (!target) return;

    const next: Pose = { ...cur };
    const last = followed.current;
    const jump =
      !last ||
      last.view !== target.view ||
      Math.hypot(target.x - last.x, target.z - last.z) > VR_LOCOMOTION.jumpUnits ||
      Math.abs(target.y - last.y) > VR_LOCOMOTION.jumpUnits ||
      Math.abs(wrap(target.yaw - last.yaw)) > VR_LOCOMOTION.jumpYaw;

    if (jump) {
      next.yaw = target.yaw - localYaw;
      const offset = _local.clone().applyAxisAngle(UP, next.yaw);
      next.x = target.x - offset.x;
      next.z = target.z - offset.z;
      next.y = target.foot;
    } else if (last) {
      next.x += target.x - last.x;
      next.z += target.z - last.z;
      next.y += target.foot - last.foot;
    }
    followed.current = target;

    if (target.view !== "dollhouse" || !br.dollhousePose) {
      orbit.current = null;
    } else {
      if (jump || !orbit.current) {
        const centre = useWorldStore.getState().bounds?.center;
        const ground = orbitPivot(br.dollhousePose, br.groundY);
        const px = centre ? centre[0] : ground.x;
        const py = centre ? centre[1] : br.groundY;
        const pz = centre ? centre[2] : ground.z;
        const anchor = new THREE.Vector3(target.x, target.y, target.z);
        const k = VR_LOCOMOTION.orbitNear - 1;
        const dx = (anchor.x - px) * k;
        const dy = (anchor.y - py) * k;
        const dz = (anchor.z - pz) * k;
        next.x += dx;
        next.y += dy;
        next.z += dz;
        anchor.set(anchor.x + dx, anchor.y + dy, anchor.z + dz);
        orbit.current = { px, py, pz, anchor, centred: !!centre };
      }
      const o = orbit.current;
      if (!o.centred) {
        const centre = useWorldStore.getState().bounds?.center;
        if (centre) {
          o.px = centre[0];
          o.py = centre[1];
          o.pz = centre[2];
          o.centred = true;
        }
      }
      if (!br.fadeVisible) {
        const dt = Math.min(delta, 0.1);
        const ls = left?.gamepad?.["xr-standard-thumbstick"];
        const rs = right?.gamepad?.["xr-standard-thumbstick"];
        const lx = axis(ls?.xAxis);
        const rx = axis(rs?.xAxis);
        const turn = Math.abs(lx) > Math.abs(rx) ? lx : rx;
        if (turn !== 0) {
          const angle = -turn * VR_LOCOMOTION.orbitRadiansPerSecond * dt;
          rotateAbout(next, o.px, o.pz, angle);
          o.anchor.set(o.anchor.x - o.px, o.anchor.y, o.anchor.z - o.pz).applyAxisAngle(UP, angle);
          o.anchor.x += o.px;
          o.anchor.z += o.pz;
        }
      }
    }

    if (ctrl && !br.fadeVisible && !br.hotspot) {
      const dt = Math.min(delta, 0.1);

      const turn = axis(right?.gamepad?.["xr-standard-thumbstick"]?.xAxis);
      if (Math.abs(turn) < VR_LOCOMOTION.snapRelease) snapArmed.current = true;
      if (snapArmed.current && Math.abs(turn) > VR_LOCOMOTION.snapEngage) {
        snapArmed.current = false;
        const angle = turn > 0 ? -VR_LOCOMOTION.snapTurnRadians : VR_LOCOMOTION.snapTurnRadians;
        rotateAbout(next, _head.x, _head.z, angle);
      }

      const stick = left?.gamepad?.["xr-standard-thumbstick"];
      const mx = axis(stick?.xAxis);
      const my = axis(stick?.yAxis);
      if (mx !== 0 || my !== 0) {
        const running = left?.gamepad?.["xr-standard-squeeze"]?.state === "pressed";
        const speed = VR_LOCOMOTION.walkUnitsPerSecond * (running ? VR_LOCOMOTION.runMultiplier : 1);
        _forward.set(0, 0, -1).applyQuaternion(_quat);
        _forward.y = 0;
        if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
        _forward.normalize();
        _right.crossVectors(_forward, UP).normalize();
        _step.set(0, 0, 0).addScaledVector(_forward, -my).addScaledVector(_right, mx);
        if (_step.lengthSq() > 1) _step.normalize();
        _step.multiplyScalar(speed * dt);

        const tries: [number, number][] = [
          [target.x + _step.x, target.z + _step.z],
          [target.x + _step.x, target.z],
          [target.x, target.z + _step.z],
        ];
        for (const [x, z] of tries) {
          const floor = ctrl.probeFloorY(x, z, target.foot);
          if (floor == null) continue;
          ctrl.teleportTo([x, floor, z], [0, target.yaw, 0]);
          break;
        }
      }
    }

    const changed =
      next.x !== cur.x || next.y !== cur.y || next.z !== cur.z || next.yaw !== cur.yaw;
    if (!changed) return;
    const rig = new XRRigidTransform(
      { x: next.x, y: next.y, z: next.z },
      { x: 0, y: Math.sin(next.yaw / 2), z: 0, w: Math.cos(next.yaw / 2) },
    );
    gl.xr.setReferenceSpace(space.getOffsetReferenceSpace(rig.inverse));
    applied.current = next;
  });

  return null;
}
