"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { degToRad } from "three/src/math/MathUtils.js";
import type { FloorConfig } from "@/shared/types";
import { useWorldStore } from "@/shared/stores/world-store";
import { FADE_MS } from "@/shared/ui/screens/fade-screen";

// Orbit damping: expressed as a decay constant (per second), not per frame.
// This makes behaviour identical regardless of monitor refresh rate.
// 6 = snappy  |  3 = floaty  |  12 = near-instant
// Dropped from 8 → 5 so the radius eases in/out instead of snapping to its
// new value — fixes the "zoom-out feels jerky" complaint.
const ORBIT_DAMPING_RATE = 5;

const ORBIT_ROTATE_SPEED = 0.005;
const ORBIT_ZOOM_SPEED   = 0.0015;

const ZOOM_MIN = 2;
const ZOOM_MAX = 80;
// The dollhouse opens this fraction of the authored pose's distance. Was 0.72
// (a bit closer than the configured framing), but the large-scale venue models
// (memorial coliseum) got cropped — open at the full authored distance now.
const DOLLHOUSE_START_SCALE = 1.0;

// Polar (tilt) bounds — between near-top-down and just above the horizon, so the
// camera never flips under the model while orbiting its centre.
const TILT_MIN = degToRad(5);
const TILT_MAX = degToRad(85);

// Fly-in: straight-line lerp + slerp, in-frame ticker (no GSAP), no Bézier arc.
// Was complex (GSAP-driven Bézier + slerp) and the per-frame cost added to
// preview shader work caused visible lag during the transition. Stripped to
// the minimum: position lerp, quaternion slerp, smootherstep ease.
const FLY_DURATION_SEC = 1.6;

// Fire the blackout cue so its fade-in finishes right as the fly-in ends.
// Lead time = FadeScreen's FADE_MS so the curves align.
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
  /** Fires during the last ~240ms of fly-in so TerminalExperience can raise the
   *  blackout while the camera completes its arc. */
  onTransitionCue?: () => void;
  /** While false, ALL camera input (drag / wheel / pinch / double-click) is
   *  ignored — used to lock the view until the load + reveal transition has
   *  fully finished. The camera still holds its authored pose. */
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

  // Where the orbit pivots
  // A STREAMED floor cannot be measured by traversing the scene: on the frame
  // the pivot is seeded only a handful of chunks have landed, and it is seeded
  // exactly ONCE — so the orbit would latch onto whichever corner downloaded
  // first. The manifest's baked world bounds describe the whole zone and are
  // published before a single chunk arrives (see StreamedModel > onBounds), so
  // a streamed dollhouse waits for those instead.
  // Read straight in the frame loop below — useFrame always calls the LATEST
  // callback, so neither needs mirroring into a ref.
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

  // Orbit around the model centre
  // The pivot is the dollhouse model's bounding-box centre; dragging turntables
  // the camera around it (spherical theta/phi), the wheel/pinch changes radius.
  const orbitCenter   = useRef(new THREE.Vector3());
  const sphTarget     = useRef(new THREE.Spherical());
  const sphCurrent    = useRef(new THREE.Spherical());
  const orbitOffset   = useRef(new THREE.Vector3());
  const sceneBounds   = useRef(new THREE.Box3());
  const orbitReady    = useRef(false);
  // Live zoom (radius) bounds. The authored dollhouse pose can sit FARTHER than
  // the static ZOOM_MAX, so seeding clamps would have made the first zoom snap
  // closer with no way back out to the initial framing. These are widened at
  // seed time to include the authored radius, so zoom-out always returns home.
  const zoomMin       = useRef(ZOOM_MIN);
  const zoomMax       = useRef(ZOOM_MAX);

  const isDragging  = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const dragMoved   = useRef(false);
  const downPointer = useRef({ x: 0, y: 0 });
  // Ref-mirrored so the (stable) canvas listeners see the live value without
  // re-binding on every interactive flip.
  const interactiveRef = useRef(interactive);
  useEffect(() => {
    interactiveRef.current = interactive;
    if (!interactive) isDragging.current = false;
  }, [interactive]);

  // The live camera pose in `site.json` › `cameras.dollhouse` format (rotation
  // as the YXZ euler seatAtHome applies), so a framing found by dragging can be
  // copied straight into the config.
  // TWO cadences, because finding a framing and recording it are different
  // jobs. WHILE the view moves it prints at 5 Hz, so the numbers can be read as
  // the model turns — that is what makes it possible to aim at something rather
  // than drag, stop, look, repeat. When the damping settles it prints once more
  // with a `settled` marker: that is the line to paste, and the throttled ones
  // above it are mid-drag samples of a pose nobody chose.
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

  // Seat the camera at its authored dollhouse pose (position + rotation). Called
  // before first paint and as a fallback before the orbit is initialised, so the
  // camera is never left at the canvas default (exterior entry) pose. The orbit
  // basis (pivot = model centre) is set up in useFrame once the GLB is committed.
  const seatAtHome = useCallback(() => {
    camera.position.set(...initPositionRef.current);
    camera.rotation.set(
      initRotationRef.current[0],
      initRotationRef.current[1],
      initRotationRef.current[2],
      "YXZ",
    );
  }, [camera]);

  // Reset orbit whenever the dollhouse config changes, then re-seat at the new
  // authored pose before the next paint. Refs are refreshed here (layout effects
  // run before the passive prop-sync effects) so seatAtHome reads the new pose.
  useLayoutEffect(() => {
    initPositionRef.current = dollHousePosition;
    initRotationRef.current = dollHouseRotation;
    isTransitioning.current = false;
    handedOff.current       = false;
    orbitReady.current      = false;
    seatAtHome();
  }, [dollHousePosition, dollHouseRotation, seatAtHome]);

  // Just captures start/end pose and flips the transition flag. The actual
  // motion happens in useFrame below — one position lerp + one slerp per frame.
  const startFlyIn = useCallback(
    (targetPos: [number, number, number], targetRot: [number, number, number]) => {
      if (isTransitioning.current) return;

      // targetPos comes from floor.startPosition — that's the FLOOR-LEVEL
      // anchor (player feet). PlayerController's usePlayerState initialises
      // camera Y = startPosition.y + cameraHeight, so the fly-in must land
      // the camera at floor-Y + cameraHeight — otherwise the handoff jumps
      // up by exactly cameraHeight (the visible "Y-jerk on landing").
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

  // Scale the orbit radius (distance from the model centre) by `factor`, clamped
  // to [ZOOM_MIN, ZOOM_MAX]. factor < 1 = zoom in, > 1 = zoom out.
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

      // Tap slop: a finger naturally jiggles far more than a mouse — with the
      // mouse's 4px the first tap of a phone double-tap kept registering as a
      // drag, so the fly-in "didn't work" on touch.
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

    // Double-tap / double-click → fly into first person. Unified on pointerup
    // (the old 'click'-pair detection required two clicks within 300ms/10px —
    // fine with a mouse, nearly impossible with a finger, so phones needed
    // many tries). Touch gets looser time/distance windows, and taps that
    // belong to a pinch gesture are ignored.
    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }

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

    // FIX 2: normalise wheel delta so trackpad and mouse wheel feel the same.
    // deltaMode 0 = pixels (trackpad), 1 = lines, 2 = pages
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

    // A cancelled pointer (OS gesture, tab switch, palm rejection) must not
    // count as a tap — just drop the drag state.
    const onPointerCancel = (e: PointerEvent) => {
      isDragging.current = false;
      lastTapTime = 0;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    // Touch — single-finger orbit + two-finger pinch zoom
    // Without these handlers the dollhouse view has NO zoom path on mobile.
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
        // Cancel any orbit drag that may have started with the first finger,
        // and any pending tap — these fingers are zooming, not double-tapping.
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
        // Pinch out → fingers further apart → scale > 1 → zoom IN (smaller
        // radius), so divide the radius by the finger-distance ratio.
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
        // The pointerups from lifting the pinch fingers land right after this
        // — remember when, so they aren't mistaken for double-tap taps.
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

    // 1. Fly-in — clean delta-based ticker.
    //    Position: straight-line lerp (no arc).
    //    Rotation: spherical slerp.
    //    Ease: smootherstep (gentle on both ends, smoother than a single cubic).
    if (isTransitioning.current) {
      flyElapsed.current += delta;
      let t = flyElapsed.current / FLY_DURATION_SEC;
      if (t >= 1) t = 1;
      const k = t * t * t * (t * (t * 6 - 15) + 10);

      camera.position.lerpVectors(flyStartPos.current, flyEndPos.current, k);
      camera.quaternion.slerpQuaternions(flyStartQuat.current, flyEndQuat.current, k);

      // Fire the blackout cue once when we cross the threshold — TerminalExperience
      // starts the FadeScreen so it reaches full opacity right at fly-in end.
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

    // 2. Orbit around the MODEL CENTRE. Initialise the orbit basis once the
    //    model is committed: pivot = its bbox centre, the spherical seeded from
    //    the authored camera pose (so the initial radius/angle match the
    //    configured dollhouse view — the camera just looks at the centre now).
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
      // Seed straight from the authored pose (NO tilt/zoom clamp here) so the
      // starting view is exactly the configured one — the clamps only bound live
      // drag/zoom input, so there's no jump on the first frame.
      sphTarget.current.setFromVector3(camPos.clone().sub(orbitCenter.current));
      sphTarget.current.radius *= DOLLHOUSE_START_SCALE;
      sphTarget.current.makeSafe();
      sphCurrent.current.copy(sphTarget.current);
      // Zoom is bounded RELATIVE to the authored framing: wheel/pinch can pull
      // in to half the configured dollHouseCamera distance and back out to
      // 1.5× it, so the venue can be inspected but never lost off-frame.
      zoomMin.current = sphTarget.current.radius * 0.5;
      zoomMax.current = sphTarget.current.radius * 1.5;

      // Position the camera from the scaled spherical (not the raw authored pose)
      // so the closer framing is applied on the first frame with no jump.
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

    // Is the view still moving — either a finger/pointer is down, or the
    // damping is still closing the gap to the target?
    const settling =
      Math.abs(sphTarget.current.theta - sphCurrent.current.theta) >= 1e-3 ||
      Math.abs(sphTarget.current.phi - sphCurrent.current.phi) >= 1e-3 ||
      Math.abs(sphTarget.current.radius - sphCurrent.current.radius) >= 1e-2;

    if (isDragging.current || settling) {
      // Live readout at 5 Hz — a line per frame would be unreadable and would
      // cost more than the orbit itself.
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