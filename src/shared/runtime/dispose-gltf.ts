import * as THREE from "three";

/**
 * disposeGLTFScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks a GLTF scene tree and disposes every GPU-backed resource exactly once:
 * geometries, materials, and every texture slot found on those materials.
 * Shared resources are deduped via Sets so we don't double-dispose.
 *
 * Most callers should use `releaseGLTF` instead — it handles React Strict
 * Mode's double-mount safely. Call this directly only when you know you have
 * a single owner of the scene.
 */
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

/**
 * Ref-counted, microtask-deferred GLTF lifecycle.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Strict Mode (and React 19's effect double-invoke in dev) runs
 * mount → cleanup → remount synchronously. A naïve "dispose on unmount"
 * effect therefore disposes the GLTF the user is about to see, forcing drei
 * to re-fetch/re-parse and producing a visible load → unload → load flash.
 *
 * Solution: count active mounts per URL. On release, drop the count and
 * schedule disposal via `queueMicrotask`. If a re-mount lands first (count
 * climbs back above zero before the microtask fires), skip the dispose.
 *
 * Usage in a component:
 *
 *   useEffect(() => {
 *     acquireGLTF(url);
 *     return () => releaseGLTF(url, scene, useGLTF.clear);
 *   }, [scene, url]);
 */
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
