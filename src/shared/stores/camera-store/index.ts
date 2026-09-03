import type * as THREE from "three";
import type { Site } from "@/config";
import { createSeededStore } from "../create-store";

/**
 * The scene's field of view, in degrees — the active model's `world.fov`.
 *
 * ONE value for every camera in a session: the Canvas creates its camera with
 * it, and this store re-applies it to whatever camera the scene registers (the
 * player and dollhouse controllers drive that same camera). Change it in the
 * site file and every view in THAT model changes together; there is no second
 * place to keep in step, and no way for one model's number to reach another's.
 *
 * Seeded by the tree's root — see `createSeededStore`.
 */
export type CameraState = {
  /** The live three.js camera, registered by the scene on mount. */
  camera: THREE.Camera | null;
  setCamera: (camera: THREE.Camera) => void;
  /**
   * The FOV actually in force. Seeded from config and moved only by the
   * `?debug=true` panel — which is why the seed is kept beside it: it is what
   * "reset" means.
   */
  fov: number;
  /** What this model authored, for the panel's reset. */
  fovSeed: number;
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

export const useCameraStore = createSeededStore<CameraState, Site>(
  "camera-store",
  (site) => (set, get) => ({
    camera: null,
    // R3F's own default is 75°, which applies to any camera created outside the
    // Canvas prop — so the registration below re-asserts ours rather than
    // trusting whatever arrives.
    setCamera: (camera) => {
      set({ camera });
      applyFov(camera, get().fov);
    },
    fov: site.scene.world.fov,
    fovSeed: site.scene.world.fov,
    setFov: (deg) => {
      set({ fov: deg });
      applyFov(get().camera, deg);
    },
  }),
);
