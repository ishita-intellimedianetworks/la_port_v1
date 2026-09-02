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
  /**
   * The FOV actually in force. Seeded from config and moved only by the
   * `?debug=true` panel — which is why the seed stays exported separately: it
   * is what "reset" means, and what the Canvas builds its camera with before
   * this store has a camera to talk to.
   */
  fov: number;
  setFov: (deg: number) => void;
};

/** Push a FOV onto a camera. Perspective-only, and a no-op when it already
 *  holds that value — `updateProjectionMatrix` is not free and this is called
 *  on every registration. */
function applyFov(camera: THREE.Camera | null, deg: number) {
  const perspective = camera as THREE.PerspectiveCamera | null;
  if (!perspective || typeof perspective.fov !== "number") return;
  if (perspective.fov === deg) return;
  perspective.fov = deg;
  perspective.updateProjectionMatrix();
}

export const useCameraStore = createStore<CameraState>((set, get) => ({
  camera: null,
  // R3F's own default is 75°, which applies to any camera created outside the
  // Canvas prop — so the registration below re-asserts ours rather than
  // trusting whatever arrives.
  setCamera: (camera) => {
    set({ camera });
    applyFov(camera, get().fov);
  },
  fov: FOV_DEFAULT,
  setFov: (deg) => {
    set({ fov: deg });
    applyFov(get().camera, deg);
  },
}));
