import type * as THREE from "three";
import { createStore } from "../create-store";

/** Field of view applied to the live camera once it registers. */
export const FOV_DEFAULT = 50;

export type CameraState = {
  /** The live three.js camera, registered by the scene on mount. */
  camera: THREE.Camera | null;
  setCamera: (camera: THREE.Camera) => void;
};

function applyDefaultFov(camera: THREE.Camera) {
  const perspective = camera as THREE.PerspectiveCamera;
  if (typeof perspective.fov !== "number") return;
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
