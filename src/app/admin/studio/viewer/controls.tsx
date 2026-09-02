"use client";

/**
 * Orbit the viewport, and read it back out.
 *
 * THAT IS THE WHOLE INTERACTION MODEL. There was a transform gizmo and a
 * click-the-model place mode; both are gone. Three ways to move a thing meant
 * three sets of rules about which one was armed, what a click meant in each,
 * and which of them a drag on a marker was — and the answer to "where does
 * this camera go" was already "wherever you are looking".
 *
 * So the viewport reports two things and the panels do the rest:
 *
 *   `livePose`    where the camera is and how it is aimed. What a camera slot
 *                 takes when you press "Use this position & rotation".
 *   `liveTarget`  the point the orbit pivots around — the middle of the view.
 *                 What a marker takes when you press "Use this point".
 *
 * ORBIT AND AUTHORED POSES DO NOT NATURALLY AGREE, and reconciling them is
 * most of what is left here. OrbitControls has no concept of a rotation — it
 * derives one from the camera position and the target it pivots around. An
 * authored pose is the opposite: a position and a rotation, no target
 * anywhere. So
 *
 *   flying TO a pose  seats the camera and ANCHORS the pivot to the camera's
 *                     own position, so the next drag re-aims the shot from
 *                     where it stands instead of swinging it around something
 *                     out in the scene. Previewing a camera is what you do
 *                     just before adjusting it, and an orbit that moved the
 *                     position threw away the half you had already got right.
 *
 *   reading it BACK   just reads the camera's quaternion. The target is a
 *                     separate answer to a separate question, not part of it.
 *
 * ANCHORING IS A PIVOT AT ARM'S LENGTH, not at zero: OrbitControls clamps the
 * camera-target distance to `minDistance`, so a target ON the camera would be
 * shoved back out and take the authored position with it. The pivot therefore
 * sits just past that clamp — sub-metre on a 2 km site — which makes a drag a
 * look-around in all but the last decimal.
 *
 * That leaves the wheel with nothing to do, since dollying toward a pivot
 * 0.6 m away is over before it starts. So while anchored the wheel is taken
 * over and moves the camera AND its pivot along the view axis together, which
 * is what "zoom" means when you are standing somewhere deciding what to look
 * at. `Frame model` releases the anchor and hands both back.
 */

import { useCallback, useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useStore, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { forwardOf, poseFromCamera, roundVec } from "../pose";
import { boundsCentre, boundsSpan, useViewerStore } from "../viewer-store";

export function StudioControls() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const orbitRef = useRef<OrbitControlsImpl>(null);

  const bounds = useViewerStore((s) => s.bounds);
  const flyRequest = useViewerStore((s) => s.flyRequest);
  const clearFly = useViewerStore((s) => s.clearFly);
  const frameRequest = useViewerStore((s) => s.frameRequest);
  const publishPose = useViewerStore((s) => s.publishPose);
  const publishTarget = useViewerStore((s) => s.publishTarget);
  const anchored = useViewerStore((s) => s.anchored);
  const setAnchored = useViewerStore((s) => s.setAnchored);

  const span = boundsSpan(bounds);
  /** The closest OrbitControls will let the camera sit to its own pivot. Used
   *  both as the dolly clamp and as the anchored pivot distance, so the two
   *  cannot disagree and shunt the camera on the first frame. */
  const nearPivot = Math.max(0.05, span / 5000);

  /** Publish both readings. `end` covers drags; subscribing to `change` alone
   *  fires per pointer move and would re-render the panel continuously. */
  const publish = useCallback(() => {
    publishPose(poseFromCamera(camera));
    const controls = orbitRef.current;
    if (controls) publishTarget(roundVec(controls.target.toArray()));
  }, [camera, publishPose, publishTarget]);

  // ── Fly to an authored pose ────────────────────────────────────────────────
  useEffect(() => {
    if (!flyRequest) return;
    const controls = orbitRef.current;
    const { pose } = flyRequest;

    camera.position.set(...pose.position);
    camera.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], "YXZ");
    camera.updateMatrixWorld();

    if (controls) {
      // Just past the dolly clamp, on the pose's own view ray. Off the ray and
      // the very first drag would snap the view somewhere the author did not
      // leave it; further along it and the drag would swing the position.
      const forward = forwardOf(pose.rotation);
      controls.target.copy(camera.position).addScaledVector(forward, nearPivot * 1.5);
      controls.update();
    }

    setAnchored(true);
    publish();
    clearFly();
  }, [flyRequest, camera, clearFly, nearPivot, setAnchored, publish]);

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
    camera.position.set(
      centre.x + distance * 0.7,
      centre.y + distance * 0.55,
      centre.z + distance * 0.7,
    );
    camera.lookAt(centre);
    if (controls) {
      controls.target.copy(centre);
      controls.update();
    }
    setAnchored(false);
    publish();
  }, [frameRequest, bounds, camera, span, setAnchored, publish]);

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

  // ── The wheel, while anchored ──────────────────────────────────────────────
  //
  // Moves the camera and its pivot along the view axis TOGETHER, so the aim
  // survives and the pivot stays at arm's length. Bound non-passively because
  // it has to preventDefault to stop the page scrolling under it.
  useEffect(() => {
    if (!anchored) return;
    const element = gl.domElement;
    const forward = new THREE.Vector3();

    const onWheel = (event: WheelEvent) => {
      const controls = orbitRef.current;
      if (!controls) return;
      event.preventDefault();
      camera.getWorldDirection(forward);
      // Proportional to the model, or a 2 km terminal takes a hundred notches
      // to cross and a 10 m room is left behind in one.
      const step = span * 0.02 * (event.deltaY > 0 ? -1 : 1);
      camera.position.addScaledVector(forward, step);
      controls.target.addScaledVector(forward, step);
      controls.update();
      publish();
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [anchored, camera, gl, span, publish]);

  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      // Pan with the right button and with two fingers — the studio is used to
      // line a camera up on a specific crane, which is panning, not orbiting
      // the whole terminal.
      screenSpacePanning
      // Scale the wheel and pan steps to the model. On a 2 km scene the
      // default step is imperceptible; on a 10 m one it overshoots.
      panSpeed={1}
      zoomSpeed={1.1}
      // Anchored, the pivot is at `nearPivot` and there is nowhere to dolly to;
      // the wheel handler above does the job instead.
      enableZoom={!anchored}
      minDistance={nearPivot}
      maxDistance={span * 6}
      onEnd={publish}
    />
  );
}
