"use client";

/**
 * The three ways to move things in the studio viewport, and the one way to
 * read the camera back out.
 *
 *   ORBIT      drag and zoom, the plain inspection gesture.
 *   FLY TO     seat the camera at an authored pose, so "what does L04 look
 *              like?" is answered by looking rather than by reading a triple.
 *   GIZMO      drag the selected marker in the world.
 *   PLACE      click the model and put the selection where the ray hit.
 *
 * ORBIT AND POSES DO NOT NATURALLY AGREE, and reconciling them is most of what
 * this file does. OrbitControls has no concept of a rotation — it derives one
 * from the camera position and a target it pivots around. An authored pose is
 * the opposite: a position and a rotation, with no target anywhere in it. So
 *
 *   flying TO a pose  seats the camera, then puts the target ON the pose's own
 *                     view ray, at the distance of whatever the ray hits (the
 *                     thing being framed) or, failing a hit, at a distance
 *                     derived from the model's size. Land the target somewhere
 *                     off the ray and the very first orbit drag snaps the view
 *                     somewhere the author did not leave it.
 *
 *   reading it BACK   just reads the camera's quaternion, in both euler orders,
 *                     and hands them to `captureSelection` to pick between.
 *                     The target plays no part — it is scaffolding for the
 *                     gesture, not part of the answer.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { useStore, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useDraftStore } from "../draft-store";
import { moveSelection } from "../mutations";
import { forwardOf, poseFromCamera, roundVec } from "../pose";
import { boundsCentre, boundsSpan, useViewerStore } from "../viewer-store";
import { selectionForward, selectionPosition } from "./markers";

/** Scratch for the focus raycast, so a fly-to allocates nothing. */
const _ray = new THREE.Raycaster();
const _hit: THREE.Intersection[] = [];

export function StudioControls() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const orbitRef = useRef<OrbitControlsImpl>(null);
  /**
   * The proxy object the transform gizmo drags.
   *
   * TransformControls moves an `Object3D`, and the obvious candidate — the
   * marker mesh itself — is rebuilt from the draft on every edit, which the
   * drag causes on every pointer move. Attaching to it would detach the gizmo
   * on the first millimetre. A stable stand-in that nothing re-creates is the
   * fix; the effect below keeps it sitting on whatever is selected.
   */
  const handle = useMemo(() => new THREE.Object3D(), []);

  const mode = useViewerStore((s) => s.mode);
  const gizmo = useViewerStore((s) => s.gizmo);
  const selection = useViewerStore((s) => s.selection);
  const bounds = useViewerStore((s) => s.bounds);
  const flyRequest = useViewerStore((s) => s.flyRequest);
  const clearFly = useViewerStore((s) => s.clearFly);
  const frameRequest = useViewerStore((s) => s.frameRequest);
  const publishPose = useViewerStore((s) => s.publishPose);

  const span = boundsSpan(bounds);

  /**
   * How far along a view ray the thing being looked at sits.
   *
   * Cast into the model and take the first hit; with no hit — an aerial camera
   * pointed at open water, or no model loaded at all — fall back to a fraction
   * of the model's longest edge, which at least puts the pivot at a plausible
   * scale rather than one metre in front of the lens.
   */
  const focusDistance = useCallback(
    (origin: THREE.Vector3, direction: THREE.Vector3) => {
      const model = scene.getObjectByName("studio-model");
      if (model) {
        _hit.length = 0;
        _ray.set(origin, direction);
        _ray.far = span * 4;
        _ray.intersectObject(model, true, _hit);
        if (_hit.length) return _hit[0].distance;
      }
      return span * 0.25;
    },
    [scene, span],
  );

  /** Publish the pose the camera is sitting at, so "Set from view" and the
   *  read-out have something to read. `end` covers drags; `change` alone
   *  fires per pointer move and would re-render the panel continuously. */
  const publish = useCallback(() => {
    publishPose(poseFromCamera(camera));
  }, [camera, publishPose]);

  // ── Fly to an authored pose ────────────────────────────────────────────────
  useEffect(() => {
    if (!flyRequest) return;
    const controls = orbitRef.current;
    const { pose } = flyRequest;

    camera.position.set(...pose.position);
    camera.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], "YXZ");
    camera.updateMatrixWorld();

    if (controls) {
      const forward = forwardOf(pose.rotation);
      const distance = focusDistance(camera.position, forward);
      controls.target.copy(camera.position).addScaledVector(forward, distance);
      controls.update();
    }

    publish();
    clearFly();
  }, [flyRequest, camera, clearFly, focusDistance, publish]);

  // ── Frame the whole model ──────────────────────────────────────────────────
  useEffect(() => {
    if (!frameRequest || !bounds) return;
    const controls = orbitRef.current;
    const centre = boundsCentre(bounds);
    // Back off along a fixed diagonal at a distance that fits the box in a
    // 35°-ish vertical field, with headroom. Deliberately not the authored
    // dollhouse pose — this is "show me everything", which is a different
    // question from "show me the shot".
    const distance = span * 1.4;
    camera.position.set(centre.x + distance * 0.7, centre.y + distance * 0.55, centre.z + distance * 0.7);
    camera.lookAt(centre);
    if (controls) {
      controls.target.copy(centre);
      controls.update();
    }
    publish();
  }, [frameRequest, bounds, camera, span, publish]);

  // ── Near / far, sized to the model ─────────────────────────────────────────
  //
  // A 2 km terminal viewed with the shipped far plane of 10,000 is fine; a
  // 10 m interior viewed with a near plane of 0.1 is fine too. A studio that
  // opens both needs the pair to follow the model, or one of them z-fights its
  // way into looking broken and the author blames the bake.
  //
  // The camera is taken from the store inside the effect, not from the
  // subscription above: this WRITES to it, and mutating a value a hook just
  // returned is the change React cannot see. Same idiom as
  // `canvas-with-wrapper`'s exposure effect.
  const store = useStore();
  useEffect(() => {
    const perspective = store.getState().camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    perspective.near = Math.max(0.01, span / 5000);
    perspective.far = Math.max(1000, span * 12);
    perspective.updateProjectionMatrix();
  }, [store, span]);

  // ── Place mode: click the model, move the selection there ──────────────────
  //
  // Bound on the DOM element rather than as an R3F `onClick` on the model so a
  // click that lands on a marker gizmo — which stops propagation to select
  // itself — cannot also move something.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (mode !== "place" || selection.kind === "none") return;
    const element = gl.domElement;

    // A click after a drag is an orbit release, not a placement. Distance
    // rather than time, because a slow careful orbit is still an orbit.
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };

    const onUp = (e: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 4) return;

      const model = scene.getObjectByName("studio-model");
      if (!model) return;
      const rect = element.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      _ray.setFromCamera(ndc, camera);
      _ray.far = Infinity;
      _hit.length = 0;
      _ray.intersectObject(model, true, _hit);
      if (!_hit.length) return;
      moveSelection(selection, roundVec(_hit[0].point.toArray()));
    };

    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
    };
  }, [mode, selection, gl, scene, camera]);

  // ── Keep the gizmo handle sitting on the selection ─────────────────────────
  //
  // One-way: draft → handle. The drag writes the other way, and this effect is
  // what re-seats the handle afterwards, so a value typed into a number field
  // moves the gizmo too.
  const draft = useDraftStore((s) => s.draft);
  useEffect(() => {
    const position = selectionPosition(draft, selection);
    if (position) handle.position.copy(position);
  }, [draft, selection, handle]);

  const showGizmo = gizmo && selection.kind !== "none" && !!selectionPosition(draft, selection);

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        // Pan with the right button and with two fingers — the studio is used
        // to line a camera up on a specific crane, which is panning, not
        // orbiting the whole terminal.
        screenSpacePanning
        // Scale the wheel and pan steps to the model. On a 2 km scene the
        // default step is imperceptible; on a 10 m one it overshoots.
        panSpeed={1}
        zoomSpeed={1.1}
        minDistance={Math.max(0.05, span / 5000)}
        maxDistance={span * 6}
        onEnd={publish}
      />

      {showGizmo && (
        <>
          <primitive object={handle} />
          <TransformControls
            object={handle}
            mode="translate"
            // Sized to the model, or a 2 km scene gets a gizmo the size of a
            // pixel and a 10 m one gets a gizmo the size of the building.
            size={0.9}
            // Suspend the orbit for the duration of a drag, and write the
            // final position WITH history so the whole gesture is one undo.
            onMouseDown={() => {
              const controls = orbitRef.current;
              if (controls) controls.enabled = false;
            }}
            onMouseUp={() => {
              const controls = orbitRef.current;
              if (controls) controls.enabled = true;
              moveSelection(selection, roundVec(handle.position.toArray()), true);
            }}
            onObjectChange={() => {
              // history: false — a drag is hundreds of these, and each one
              // pushing an undo entry would bury the state before the drag.
              moveSelection(selection, roundVec(handle.position.toArray()), false);
            }}
          />
        </>
      )}
    </>
  );
}

/** Re-exported so the panels can ask "which way is this camera looking?"
 *  without importing from the markers module directly. */
export { selectionForward, selectionPosition };
