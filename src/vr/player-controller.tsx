"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { XROrigin, useXR, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import type { Pathfinding } from "three-pathfinding";

type Vec3 = [number, number, number];
type Point = { x: number; y: number; z: number };
type NavTarget = { x: number; y?: number; eyeY?: number; z: number };
type NavNode = ReturnType<Pathfinding["getClosestNode"]>;

export interface VrPlayerHandle {
  navigateToPoint: (pos: NavTarget, targetZone?: string, onDone?: () => void) => boolean;
  stopNavigation: () => void;
  measurePathTo: (pos: NavTarget, targetZone?: string) => number | null;
  measurePathsTo: (targets: NavTarget[], targetZone?: string) => (number | null)[];
  previewTo: (pos: NavTarget, targetZone?: string) => boolean;
  clearPreview: () => void;
  getPreviewPath3D: () => Point[];
  isMoving: () => boolean;
  getPosition: () => Point;
  getRotationY: () => number;
  getPath: () => { x: number; z: number }[];
  getPath3D: () => Point[];
  getFootPosition: () => Point;
  getSpeed: () => number;
  getMetersPerUnit: () => number;
  resetToStart: () => void;
  teleportTo: (pos: Vec3, rot: Vec3, smooth?: boolean) => void;
  probeFloorY: (x: number, z: number, expectedY?: number) => number | null;
  nearestNavPoint: (pos?: { x: number; y?: number; z: number }) => (Point & { dist: number }) | null;
  getCurrentZone: () => string;
  setCurrentZone: (z: string) => void;
  setOnNavigationComplete: (cb: (() => void) | null) => void;
  setSpeedMultiplier: (v: number) => void;
  getSpeedMultiplier: () => number;
  startIdleDrift: () => void;
  stopIdleDrift?: () => void;
  lookAtPoint: (target: { x: number; z: number }) => void;
  captureScreenshot: (download?: boolean) => string;
  setPitchLock: (v: boolean) => void;
}

export interface VrPlayerControllerProps {
  enabled?: boolean;
  cameraHeight?: number;
  metersPerUnit?: number;
  startPosition?: Vec3;
  startRotation?: Vec3;
  pathfinding: Pathfinding;
  initialZone: string;
  onZoneChange?: (zone: string) => void;
  probeFloorY: (pathfinding: Pathfinding, zone: string, x: number, z: number, expectedY?: number) => number | null;
}

export const VR_LOCOMOTION = {
  walkUnitsPerSecond: 3,
  runMultiplier: 4,
  deadzone: 0.15,
  snapTurnRadians: THREE.MathUtils.degToRad(30),
  snapEngage: 0.6,
  snapRelease: 0.3,
  floorFollow: 12,
} as const;

const UP = new THREE.Vector3(0, 1, 0);
const _head = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _step = new THREE.Vector3();
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _clamped = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

function axis(v: number | undefined) {
  const x = v ?? 0;
  return Math.abs(x) < VR_LOCOMOTION.deadzone ? 0 : x;
}

export const VrPlayerController = forwardRef<VrPlayerHandle, VrPlayerControllerProps>(
  (
    {
      enabled = true,
      cameraHeight = 1.7,
      metersPerUnit = 1,
      startPosition = [0, 0, 0],
      startRotation = [0, 0, 0],
      pathfinding,
      initialZone,
      onZoneChange,
      probeFloorY,
    },
    ref,
  ) => {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const flatCamera = useThree((s) => s.camera);
    const presenting = useXR((s) => s.session != null);
    const left = useXRInputSourceState("controller", "left");
    const right = useXRInputSourceState("controller", "right");

    const originRef = useRef<THREE.Group>(null);
    const zone = useRef(initialZone);
    const group = useRef<number | null>(null);
    const node = useRef<NavNode | null>(null);
    const pitch = useRef(startRotation[0]);
    const lastPose = useRef<{ p: Vec3; r: Vec3 }>({ p: startPosition, r: startRotation });
    const realign = useRef(false);
    const snapArmed = useRef(true);
    const floorTarget = useRef<number | null>(null);
    const speedMult = useRef(1);
    const presentingRef = useRef(presenting);
    const cameraRef = useRef<THREE.Camera>(flatCamera);

    const headWorld = (out: THREE.Vector3) => {
      const o = originRef.current;
      if (presentingRef.current) return cameraRef.current.getWorldPosition(out);
      if (!o) return out.set(0, 0, 0);
      return out.set(o.position.x, o.position.y + cameraHeight, o.position.z);
    };

    const headYaw = () => {
      if (!presentingRef.current) return originRef.current?.rotation.y ?? 0;
      cameraRef.current.getWorldQuaternion(_quat);
      return _euler.setFromQuaternion(_quat, "YXZ").y;
    };

    const resetNode = () => {
      group.current = null;
      node.current = null;
    };

    const place = (p: Vec3, r: Vec3) => {
      lastPose.current = { p, r };
      const o = originRef.current;
      if (!o) return;
      if (presentingRef.current) {
        const cam = cameraRef.current;
        const localYaw = _euler.setFromQuaternion(cam.quaternion, "YXZ").y;
        const yaw = r[1] - localYaw;
        o.rotation.set(0, yaw, 0);
        _offset.set(cam.position.x, 0, cam.position.z).applyAxisAngle(UP, yaw);
        o.position.set(p[0] - _offset.x, p[1], p[2] - _offset.z);
      } else {
        o.rotation.set(0, r[1], 0);
        o.position.set(p[0], p[1], p[2]);
      }
      pitch.current = r[0];
      floorTarget.current = null;
      o.updateMatrixWorld();
      resetNode();
    };

    const probe = (x: number, z: number, expectedY?: number) =>
      probeFloorY(pathfinding, zone.current, x, z, expectedY);

    useEffect(() => {
      presentingRef.current = presenting;
      realign.current = true;
    }, [presenting]);

    useEffect(() => {
      zone.current = initialZone;
      resetNode();
    }, [initialZone]);

    useEffect(() => {
      place(startPosition, startRotation);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPosition, startRotation]);

    useFrame((state, delta) => {
      cameraRef.current = state.camera;
      const o = originRef.current;
      if (!o) return;

      if (realign.current) {
        realign.current = false;
        place(lastPose.current.p, lastPose.current.r);
      }

      if (!presentingRef.current) {
        flatCamera.position.set(o.position.x, o.position.y + cameraHeight, o.position.z);
        flatCamera.rotation.set(pitch.current, o.rotation.y, 0, "YXZ");
        return;
      }

      if (!enabled) return;
      const dt = Math.min(delta, 0.1);

      const turn = axis(right?.gamepad?.["xr-standard-thumbstick"]?.xAxis);
      if (Math.abs(turn) < VR_LOCOMOTION.snapRelease) snapArmed.current = true;
      if (snapArmed.current && Math.abs(turn) > VR_LOCOMOTION.snapEngage) {
        snapArmed.current = false;
        const angle = turn > 0 ? -VR_LOCOMOTION.snapTurnRadians : VR_LOCOMOTION.snapTurnRadians;
        state.camera.getWorldPosition(_head);
        _head.y = o.position.y;
        o.position.sub(_head).applyAxisAngle(UP, angle).add(_head);
        o.rotation.y += angle;
        o.updateMatrixWorld();
      }

      const stick = left?.gamepad?.["xr-standard-thumbstick"];
      const mx = axis(stick?.xAxis);
      const my = axis(stick?.yAxis);
      if (mx !== 0 || my !== 0) {
        const running = left?.gamepad?.["xr-standard-squeeze"]?.state === "pressed";
        const speed =
          VR_LOCOMOTION.walkUnitsPerSecond *
          speedMult.current *
          (running ? VR_LOCOMOTION.runMultiplier : 1);

        state.camera.getWorldDirection(_forward);
        _forward.y = 0;
        if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
        _forward.normalize();
        _right.crossVectors(_forward, UP).normalize();
        _step.set(0, 0, 0).addScaledVector(_forward, -my).addScaledVector(_right, mx);
        if (_step.lengthSq() > 1) _step.normalize();
        _step.multiplyScalar(speed * dt);

        state.camera.getWorldPosition(_head);
        _start.set(_head.x, o.position.y, _head.z);
        _end.copy(_start).add(_step);

        const zoneId = zone.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasZone = !!(pathfinding as any).zones?.[zoneId];
        if (hasZone) {
          if (group.current == null) group.current = pathfinding.getGroup(zoneId, _start) ?? null;
          if (group.current != null) {
            if (!node.current) node.current = pathfinding.getClosestNode(_start, zoneId, group.current);
            if (node.current) {
              node.current = pathfinding.clampStep(_start, _end, node.current, zoneId, group.current, _clamped);
              o.position.x += _clamped.x - _start.x;
              o.position.z += _clamped.z - _start.z;
              floorTarget.current = probe(_clamped.x, _clamped.z, o.position.y) ?? _clamped.y;
            }
          }
        }
      }

      if (floorTarget.current != null) {
        const k = 1 - Math.exp(-VR_LOCOMOTION.floorFollow * dt);
        o.position.y += (floorTarget.current - o.position.y) * k;
        if (Math.abs(floorTarget.current - o.position.y) < 1e-3) floorTarget.current = null;
      }

      if (mx !== 0 || my !== 0 || !snapArmed.current) {
        state.camera.getWorldPosition(_head);
        lastPose.current = { p: [_head.x, o.position.y, _head.z], r: [0, headYaw(), 0] };
      }
    });

    useImperativeHandle(ref, () => ({
      navigateToPoint: () => false,
      stopNavigation: () => {},
      measurePathTo: () => null,
      measurePathsTo: (targets) => targets.map(() => null),
      previewTo: () => false,
      clearPreview: () => {},
      getPreviewPath3D: () => [],
      isMoving: () => false,
      getPosition: () => {
        headWorld(_head);
        const foot = originRef.current?.position.y ?? 0;
        return { x: _head.x, y: foot + cameraHeight, z: _head.z };
      },
      getRotationY: () => headYaw(),
      getPath: () => [],
      getPath3D: () => [],
      getFootPosition: () => {
        headWorld(_head);
        return { x: _head.x, y: originRef.current?.position.y ?? 0, z: _head.z };
      },
      getSpeed: () => VR_LOCOMOTION.walkUnitsPerSecond * speedMult.current,
      getMetersPerUnit: () => metersPerUnit,
      resetToStart: () => place(startPosition, startRotation),
      teleportTo: (p, r) => place(p, r),
      probeFloorY: (x, z, expectedY) => probe(x, z, expectedY),
      nearestNavPoint: (pos) => {
        const zoneId = zone.current;
        headWorld(_head);
        const foot = new THREE.Vector3(
          pos?.x ?? _head.x,
          pos?.y ?? originRef.current?.position.y ?? 0,
          pos?.z ?? _head.z,
        );
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const z = (pathfinding as any).zones?.[zoneId];
          if (!z) return null;
          const groups: number = z.groups?.length ?? 0;
          let best: (Point & { dist: number }) | null = null;
          for (let g = 0; g < groups; g++) {
            const n = pathfinding.getClosestNode(foot, zoneId, g);
            if (!n) continue;
            const c = n.centroid;
            const d = Math.hypot(c.x - foot.x, c.y - foot.y, c.z - foot.z);
            if (!best || d < best.dist) best = { x: c.x, y: c.y, z: c.z, dist: d };
          }
          return best;
        } catch {
          return null;
        }
      },
      getCurrentZone: () => zone.current,
      setCurrentZone: (z) => {
        zone.current = z;
        resetNode();
        onZoneChange?.(z);
      },
      setOnNavigationComplete: () => {},
      setSpeedMultiplier: (v) => {
        speedMult.current = v;
      },
      getSpeedMultiplier: () => speedMult.current,
      startIdleDrift: () => {},
      stopIdleDrift: () => {},
      lookAtPoint: (target) => {
        const o = originRef.current;
        if (!o) return;
        headWorld(_head);
        const yaw = Math.atan2(target.x - _head.x, target.z - _head.z) + Math.PI;
        place([_head.x, o.position.y, _head.z], [0, yaw, 0]);
      },
      captureScreenshot: (download = false) => {
        gl.render(scene, cameraRef.current);
        const url = gl.domElement.toDataURL("image/png");
        if (download) {
          const a = document.createElement("a");
          a.href = url;
          a.download = `screenshot-${Date.now()}.png`;
          a.click();
        }
        return url;
      },
      setPitchLock: () => {},
    }));

    return <XROrigin ref={originRef} />;
  },
);

VrPlayerController.displayName = "VrPlayerController";
