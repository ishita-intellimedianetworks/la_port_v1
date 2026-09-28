import * as THREE from "three";

export interface FurnitureSwapConfig {
  groups?: string[];
  textureSwaps?: Record<string, string>;
}

type StdMat = THREE.MeshStandardMaterial;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_\-\.]+/g, "");
}

function matchesKey(matNorm: string, keyNorm: string): boolean {
  if (matNorm === keyNorm) return true;
  if (matNorm.startsWith(keyNorm)) {
    const suffix = matNorm.slice(keyNorm.length);
    return /^\d+$/.test(suffix);
  }
  return false;
}

export function setupFurnitureToggle(
  scene: THREE.Object3D,
  config: FurnitureSwapConfig,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
): (visible: boolean) => void {
  const { groups = [], textureSwaps = {} } = config;

  const byMat = new Map<string, { mat: StdMat; meshes: THREE.Mesh[] }>();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m?.name) continue;
      const key = norm(m.name);
      if (!byMat.has(key)) byMat.set(key, { mat: m as StdMat, meshes: [] });
      byMat.get(key)!.meshes.push(mesh);
    }
  });

  const store = new Map<string, {
    meshes: { mesh: THREE.Mesh; originalMat: StdMat }[];
    carrierMat: StdMat | null;
  }>();

  for (const [key, value] of Object.entries(textureSwaps)) {
    const nk = norm(key);
    const nv = norm(value);

    const meshes: { mesh: THREE.Mesh; originalMat: StdMat }[] = [];
    for (const [matNorm, data] of byMat) {
      if (matchesKey(matNorm, nk)) {
        for (const mesh of data.meshes) {
          meshes.push({ mesh, originalMat: data.mat });
        }
      }
    }

    let carrierMat: StdMat | null = null;
    for (const [matNorm, data] of byMat) {
      if (matchesKey(matNorm, nv)) {
        carrierMat = data.mat;
        break;
      }
    }

    if (meshes.length && carrierMat) {
      meshes.forEach(({ mesh }) => {
        mesh.material = carrierMat!;
        (carrierMat as StdMat).needsUpdate = true;
      });
    }

    if (meshes.length) store.set(nk, { meshes, carrierMat });
  }

  renderer.compile(scene, camera);

  return function toggleFurniture(visible: boolean): void {
    store.forEach(({ meshes, carrierMat }) => {
      if (visible) {
        meshes.forEach(({ mesh, originalMat }) => {
          mesh.material = originalMat;
          (originalMat as StdMat).needsUpdate = true;
        });
      } else {
        if (!carrierMat) return;
        meshes.forEach(({ mesh }) => {
          mesh.material = carrierMat!;
          (carrierMat as StdMat).needsUpdate = true;
        });
      }
    });

    if (groups.length) {
      const patterns = groups.map(norm);
      scene.traverse((obj) => {
        if (!obj.name) return;
        const objNorm = norm(obj.name);
        if (!patterns.some(p => matchesKey(objNorm, p))) return;
        obj.visible = visible;
        obj.traverse((c) => { c.visible = visible; });
      });
    }
  };
}
