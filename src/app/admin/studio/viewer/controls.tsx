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
 *   flying TO a pose  seats the camera, then puts the target ON the pose's own
 *                     view ray, at the distance of whatever the ray hits (the
 *                     thing being framed) or, failing a hit, at a distance
 *                     derived from the model's size. Land the target somewhere
 *                     off the ray and the very first orbit drag snaps the view
 *                     somewhere the author did not leave it.
 *
 *   reading it BACK   just reads the camera's quaternion. The target is a
 *                     separate answer to a separate question, not part of it.
 */

import { useCallback, useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useStore, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { forwardOf, poseFromCamera, roundVec } from "../pose";
import { boundsCentre, boundsSpan, useViewerStore } from "../viewer-store";

/** Scratch for the focus raycast, so a fly-to allocates nothing. */
const _ray = new THREE.Raycaster();
const _hit: THREE.Intersection[] = [];

export function StudioControls() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const orbitRef = useRef<OrbitControlsImpl>(null);

  const bounds = useViewerStore((s) => s.bounds);
  const flyRequest = useViewerStore((s) => s.flyRequest);
  const clearFly = useViewerStore((s) => s.clearFly);
  const frameRequest = useViewerStore((s) => s.frameRequest);
  const publishPose = useViewerStore((s) => s.publishPose);
  const publishTarget = useViewerStore((s) => s.publishTarget);

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
      minDistance={Math.max(0.05, span / 5000)}
      maxDistance={span * 6}
      onEnd={publish}
    />
  );
}
