"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { degToRad } from "three/src/math/MathUtils.js";
import type { FloorConfig } from "@/shared/types";
import { useWorldStore } from "@/shared/stores/world-store";
import { FADE_MS } from "@/shared/ui/screens/fade-screen";

const ORBIT_DAMPING_RATE = 5;

const ORBIT_ROTATE_SPEED = 0.005;
const ORBIT_ZOOM_SPEED   = 0.0015;

const ZOOM_MIN = 2;
const ZOOM_MAX = 80;
const DOLLHOUSE_START_SCALE = 1.0;

const TILT_MIN = degToRad(5);
const TILT_MAX = degToRad(85);

const FLY_DURATION_SEC = 1.6;

const BLACKOUT_LEAD_SEC = FADE_MS / 1000;
const BLACKOUT_CUE_FRAC = 1 - BLACKOUT_LEAD_SEC / FLY_DURATION_SEC;

const DBLCLICK_MAX_MS = 300;
const DBLCLICK_MAX_PX = 10;

interface DollhouseCameraProps {
  dollHousePosition: [number, number, number];
  dollHouseRotation: [number, number, number];
  activeFloor: FloorConfig;
  cameraHeight?: number;
  onEnterFirstPerson: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
  onTransitionCue?: () => void;
  interactive?: boolean;
}

export default function DollhouseCamera({
  dollHousePosition,
  dollHouseRotation,
  activeFloor,
  cameraHeight,
  onEnterFirstPerson,
  onTransitionCue,
  interactive = true,
}: DollhouseCameraProps) {
  const { camera, gl, scene } = useThree();

  const streamed = !!activeFloor?.streamed;
  const worldBounds = useWorldStore((s) => s.bounds);

  const isTransitioning = useRef(false);
  const handedOff       = useRef(false);
  const flyElapsed      = useRef(0);
  const flyStartPos     = useRef(new THREE.Vector3());
  const flyEndPos       = useRef(new THREE.Vector3());
  const flyStartQuat    = useRef(new THREE.Quaternion());
  const flyEndQuat      = useRef(new THREE.Quaternion());
  const flyTargetRot    = useRef<[number, number, number]>([0, 0, 0]);
  const flyTargetPos    = useRef<[number, number, number]>([0, 0, 0]);
  const blackoutCued    = useRef(false);

  const orbitCenter   = useRef(new THREE.Vector3());
  const sphTarget     = useRef(new THREE.Spherical());
  const sphCurrent    = useRef(new THREE.Spherical());
  const orbitOffset   = useRef(new THREE.Vector3());
  const sceneBounds   = useRef(new THREE.Box3());
  const orbitReady    = useRef(false);
  const zoomMin       = useRef(ZOOM_MIN);
  const zoomMax       = useRef(ZOOM_MAX);

  const isDragging  = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragMoved   = useRef(false);
  const downPointer = useRef({ x: 0, y: 0 });
  const interactiveRef = useRef(interactive);
  useEffect(() => {
    interactiveRef.current = interactive;
    if (!interactive) isDragging.current = false;
  }, [interactive]);

  const poseDirty = useRef(false);
  const liveLogAt = useRef(0);
  const logPose = useCallback((settled: boolean) => {
    if (typeof window === "undefined" ||
        new URLSearchParams(window.location.search).get("debug") !== "true") return;
    const r = (v: number) => Math.round(v * 10000) / 10000;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    const p = camera.position;
    console.log(
      `[dollhouse${settled ? " settled" : ""}] "dollhouse": { "position": [${r(p.x)}, ${r(p.y)}, ${r(p.z)}], "rotation": [${r(e.x)}, ${r(e.y)}, ${r(e.z)}] }`,
    );
  }, [camera]);

  const onEnterRef      = useRef(onEnterFirstPerson);
  const onCueRef        = useRef(onTransitionCue);
  const activeFloorRef  = useRef(activeFloor);
  const initPositionRef = useRef(dollHousePosition);
  const initRotationRef = useRef(dollHouseRotation);
  useEffect(() => { onEnterRef.current      = onEnterFirstPerson; }, [onEnterFirstPerson]);
  useEffect(() => { onCueRef.current        = onTransitionCue; },     [onTransitionCue]);
  useEffect(() => { activeFloorRef.current  = activeFloor; },        [activeFloor]);
  useEffect(() => { initPositionRef.current = dollHousePosition; },  [dollHousePosition]);
  useEffect(() => { initRotationRef.current = dollHouseRotation; },  [dollHouseRotation]);

  const seatAtHome = useCallback(() => {
    camera.position.set(...initPositionRef.current);
    camera.rotation.set(
      initRotationRef.current[0],
      initRotationRef.current[1],
      initRotationRef.current[2],
      "YXZ",
    );
  }, [camera]);

  useLayoutEffect(() => {
    initPositionRef.current = dollHousePosition;
    initRotationRef.current = dollHouseRotation;
    isTransitioning.current = false;
    handedOff.current       = false;
    orbitReady.current      = false;
    seatAtHome();
  }, [dollHousePosition, dollHouseRotation, seatAtHome]);

  const startFlyIn = useCallback(
    (targetPos: [number, number, number], targetRot: [number, number, number]) => {
      if (isTransitioning.current) return;

      const eyeY = targetPos[1] + (cameraHeight ?? 0);

      flyStartPos.current.copy(camera.position);
      flyEndPos.current.set(targetPos[0], eyeY, targetPos[2]);

      flyStartQuat.current.copy(camera.quaternion);
      flyEndQuat.current.setFromEuler(
        new THREE.Euler(targetRot[0], targetRot[1], targetRot[2], "YXZ"),
      );
      if (flyStartQuat.current.dot(flyEndQuat.current) < 0) {
        flyEndQuat.current.set(
          -flyEndQuat.current.x,
          -flyEndQuat.current.y,
          -flyEndQuat.current.z,
          -flyEndQuat.current.w,
        );
      }

      flyTargetPos.current  = targetPos;
      flyTargetRot.current  = targetRot;
      flyElapsed.current    = 0;
      blackoutCued.current  = false;
      isTransitioning.current = true;
    },
    [camera, cameraHeight],
  );

  const zoomBy = useCallback((factor: number) => {
    sphTarget.current.radius = Math.max(
      zoomMin.current, Math.min(zoomMax.current, sphTarget.current.radius * factor),
    );
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    let lastTapTime  = 0;
    let lastTapX     = 0;
    let lastTapY     = 0;
    let lastPinchEnd = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (isTransitioning.current || !interactiveRef.current) return;
      isDragging.current  = true;
      dragMoved.current   = false;
      downPointer.current = { x: e.clientX, y: e.clientY };
      lastPointer.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current || isTransitioning.current || !interactiveRef.current) return;

      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      const slop = e.pointerType === "touch" ? 12 : 4;
      if (
        Math.abs(e.clientX - downPointer.current.x) > slop ||
        Math.abs(e.clientY - downPointer.current.y) > slop
      ) {
        dragMoved.current = true;
      }

      sphTarget.current.theta -= dx * ORBIT_ROTATE_SPEED;
      sphTarget.current.phi    = Math.max(
        TILT_MIN,
        Math.min(TILT_MAX, sphTarget.current.phi - dy * ORBIT_ROTATE_SPEED),
      );
      poseDirty.current = true;
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}

      if (isTransitioning.current || !interactiveRef.current) return;
      const touch = e.pointerType === "touch";
      if (!touch && e.button !== 0) return;
      const now = performance.now();
      if (dragMoved.current || (touch && now - lastPinchEnd < 400)) {
        lastTapTime = 0;
        return;
      }
      const maxMs = touch ? 450 : DBLCLICK_MAX_MS;
      const maxPx = touch ? 32 : DBLCLICK_MAX_PX;
      const isDoubleTap =
        now - lastTapTime < maxMs &&
        Math.abs(e.clientX - lastTapX) < maxPx &&
        Math.abs(e.clientY - lastTapY) < maxPx;
      if (isDoubleTap) {
        lastTapTime = 0;
        const floor = activeFloorRef.current;
        if (floor.dollhouseOnly) return;
        startFlyIn(
          (floor.startPosition ?? [0, 0, 0]) as [number, number, number],
          (floor.startRotation ?? [0, 0, 0]) as [number, number, number],
        );
      } else {
        lastTapTime = now;
        lastTapX    = e.clientX;
        lastTapY    = e.clientY;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (isTransitioning.current || !interactiveRef.current) return;
      e.preventDefault();
      const norm =
        e.deltaMode === 1 ? e.deltaY * 16 :
        e.deltaMode === 2 ? e.deltaY * 400 :
        e.deltaY;
      zoomBy(1 + norm * ORBIT_ZOOM_SPEED);
      poseDirty.current = true;
    };

    const onPointerCancel = (e: PointerEvent) => {
      isDragging.current = false;
      lastTapTime = 0;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
    };

    let pinchLastDist = 0;
    let pinchActive = false;

    const onTouchStart = (e: TouchEvent) => {
      if (isTransitioning.current || !interactiveRef.current) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        pinchLastDist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        pinchActive = true;
        isDragging.current = false;
        lastTapTime = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isTransitioning.current || !interactiveRef.current) return;
      if (e.touches.length === 2 && pinchActive) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const scale = dist / pinchLastDist;
        pinchLastDist = dist;
        zoomBy(1 / scale);
        poseDirty.current = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchActive) {
        pinchActive = false;
        pinchLastDist = 0;
        lastPinchEnd = performance.now();
      }
    };

    canvas.addEventListener("pointerdown",   onPointerDown);
    canvas.addEventListener("pointermove",   onPointerMove);
    canvas.addEventListener("pointerup",     onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false, capture: false });
    canvas.addEventListener("touchstart",  onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",   onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",    onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);

    return () => {
      canvas.removeEventListener("pointerdown",   onPointerDown);
      canvas.removeEventListener("pointermove",   onPointerMove);
      canvas.removeEventListener("pointerup",     onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel",         onWheel);
      canvas.removeEventListener("touchstart",    onTouchStart);
      canvas.removeEventListener("touchmove",     onTouchMove);
      canvas.removeEventListener("touchend",      onTouchEnd);
      canvas.removeEventListener("touchcancel",   onTouchEnd);
    };
  }, [gl, camera, startFlyIn, zoomBy]);

  useFrame((_state, delta) => {
    if (handedOff.current) return;

    if (isTransitioning.current) {
      flyElapsed.current += delta;
      let t = flyElapsed.current / FLY_DURATION_SEC;
      if (t >= 1) t = 1;
      const k = t * t * t * (t * (t * 6 - 15) + 10);

      camera.position.lerpVectors(flyStartPos.current, flyEndPos.current, k);
      camera.quaternion.slerpQuaternions(flyStartQuat.current, flyEndQuat.current, k);

      if (!blackoutCued.current && t >= BLACKOUT_CUE_FRAC) {
        blackoutCued.current = true;
        onCueRef.current?.();
      }

      if (t >= 1) {
        isTransitioning.current = false;
        handedOff.current       = true;
        onEnterRef.current(flyTargetPos.current, flyTargetRot.current);
      }
      return;
    }

    if (!orbitReady.current) {
      sceneBounds.current.makeEmpty();
      if (streamed) {
        if (!worldBounds) { seatAtHome(); return; }
        sceneBounds.current.set(
          new THREE.Vector3(...worldBounds.min),
          new THREE.Vector3(...worldBounds.max),
        );
      } else {
        scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          let n: THREE.Object3D | null = mesh;
          while (n) { if (!n.visible) return; n = n.parent; }
          sceneBounds.current.expandByObject(mesh);
        });
        if (sceneBounds.current.isEmpty()) { seatAtHome(); return; }
      }

      sceneBounds.current.getCenter(orbitCenter.current);
      const camPos = new THREE.Vector3(...initPositionRef.current);
      sphTarget.current.setFromVector3(camPos.clone().sub(orbitCenter.current));
      sphTarget.current.radius *= DOLLHOUSE_START_SCALE;
      sphTarget.current.makeSafe();
      sphCurrent.current.copy(sphTarget.current);
      zoomMin.current = sphTarget.current.radius * 0.5;
      zoomMax.current = sphTarget.current.radius * 1.5;

      orbitOffset.current.setFromSpherical(sphCurrent.current);
      camera.position.copy(orbitCenter.current).add(orbitOffset.current);
      camera.lookAt(orbitCenter.current);
      orbitReady.current = true;
      return;
    }

    const alpha = 1 - Math.exp(-ORBIT_DAMPING_RATE * delta);
    sphCurrent.current.theta  += (sphTarget.current.theta  - sphCurrent.current.theta)  * alpha;
    sphCurrent.current.phi    += (sphTarget.current.phi    - sphCurrent.current.phi)    * alpha;
    sphCurrent.current.radius += (sphTarget.current.radius - sphCurrent.current.radius) * alpha;

    orbitOffset.current.setFromSpherical(sphCurrent.current);
    camera.position.copy(orbitCenter.current).add(orbitOffset.current);
    camera.lookAt(orbitCenter.current);

    const settling =
      Math.abs(sphTarget.current.theta - sphCurrent.current.theta) >= 1e-3 ||
      Math.abs(sphTarget.current.phi - sphCurrent.current.phi) >= 1e-3 ||
      Math.abs(sphTarget.current.radius - sphCurrent.current.radius) >= 1e-2;

    if (isDragging.current || settling) {
      const now = performance.now();
      if (now - liveLogAt.current >= 200) {
        liveLogAt.current = now;
        logPose(false);
      }
    } else if (poseDirty.current) {
      poseDirty.current = false;
      logPose(true);
    }
  });

  return null;
}
