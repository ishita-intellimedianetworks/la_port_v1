import type * as THREE from "three";
import type { Site } from "@/config";
import { createSeededStore } from "../create-store";

export type CameraState = {
  camera: THREE.Camera | null;
  setCamera: (camera: THREE.Camera) => void;
  fov: number;
  fovSeed: number;
  setFov: (deg: number) => void;
};

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
