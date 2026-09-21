import * as THREE from "three";

export function disposeGLTFScene(scene: THREE.Object3D): void {
  const seenGeo = new Set<THREE.BufferGeometry>();
  const seenMat = new Set<THREE.Material>();
  const seenTex = new Set<THREE.Texture>();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !seenGeo.has(mesh.geometry)) {
      seenGeo.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      if (!m || seenMat.has(m)) continue;
      seenMat.add(m);
      const slots = m as unknown as Record<string, unknown>;
      for (const key of Object.keys(slots)) {
        const v = slots[key] as THREE.Texture | undefined;
        if (v && (v as THREE.Texture).isTexture && !seenTex.has(v)) {
          seenTex.add(v);
          v.dispose();
        }
      }
      m.dispose();
    }
  });
}

const activeMounts = new Map<string, number>();

export function acquireGLTF(url: string): void {
  activeMounts.set(url, (activeMounts.get(url) ?? 0) + 1);
}

export function releaseGLTF(
  url: string,
  scene: THREE.Object3D,
  clearCache: (url: string) => void,
): void {
  const next = (activeMounts.get(url) ?? 1) - 1;
  if (next > 0) {
    activeMounts.set(url, next);
    return;
  }
  activeMounts.delete(url);
  queueMicrotask(() => {
    if (activeMounts.has(url)) return;
    clearCache(url);
    disposeGLTFScene(scene);
  });
}
