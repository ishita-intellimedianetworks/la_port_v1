import type * as THREE from "three";
import { scene } from "@/config";
import { createStore } from "../create-store";

/**
 * The scene's field of view, in degrees — `site.json` › `world.fov`.
 *
 * ONE value for every camera: the Canvas creates its camera with it, and this
 * store re-applies it to whatever camera the scene registers (the player and
 * dollhouse controllers drive that same camera). Change it in site.json and
 * every view changes together; there is no second place to keep in step.
 */
export const FOV_DEFAULT = scene.world.fov;

export type CameraState = {
  /** The live three.js camera, registered by the scene on mount. */
  camera: THREE.Camera | null;
  setCamera: (camera: THREE.Camera) => void;
};

/** Re-assert the configured FOV on a camera the scene just handed us — R3F's
 *  own default (75°) applies to any camera created outside the Canvas prop. */
function applyDefaultFov(camera: THREE.Camera) {
  const perspective = camera as THREE.PerspectiveCamera;
  if (typeof perspective.fov !== "number") return;
  if (perspective.fov === FOV_DEFAULT) return;
  perspective.fov = FOV_DEFAULT;
  perspective.updateProjectionMatrix();
}

export const useCameraStore = createStore<CameraState>((set) => ({
  camera: null,
  setCamera: (camera) => {
    set({ camera });
    applyDefaultFov(camera);
  },
}));
