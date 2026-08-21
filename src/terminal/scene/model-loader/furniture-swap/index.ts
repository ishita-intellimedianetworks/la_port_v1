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
    return /^\d+$/.test(suffix); // wall001, wall002 … all match "wall"
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

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Traverse the entire scene once.
  //           Build a map of: normalised material name → { mat, meshes[] }
  // ─────────────────────────────────────────────────────────────────────────
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


  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — For every textureSwap entry:
  //           a) collect meshes that have the KEY material
  //           b) grab the carrier mat from the mesh that has the VALUE material
  //           c) swap all key-meshes → carrierMat  (initial OFF state)
  //           d) store originalMat per mesh so toggle can restore it
  // ─────────────────────────────────────────────────────────────────────────
  const store = new Map<string, {
    meshes: { mesh: THREE.Mesh; originalMat: StdMat }[];
    carrierMat: StdMat | null;
  }>();

  for (const [key, value] of Object.entries(textureSwaps)) {
    const nk = norm(key);
    const nv = norm(value);

    // a) all meshes with the key material
    const meshes: { mesh: THREE.Mesh; originalMat: StdMat }[] = [];
    for (const [matNorm, data] of byMat) {
      if (matchesKey(matNorm, nk)) {
        for (const mesh of data.meshes) {
          meshes.push({ mesh, originalMat: data.mat });
        }
      }
    }

    // b) carrier material — from the mesh that has the value material
    let carrierMat: StdMat | null = null;
    for (const [matNorm, data] of byMat) {
      if (matchesKey(matNorm, nv)) {
        carrierMat = data.mat;
        break;
      }
    }


    // c) swap key-meshes to carrier mat right now (start in furniture-OFF state)
    if (meshes.length && carrierMat) {
      meshes.forEach(({ mesh }) => {
        mesh.material = carrierMat!;
        (carrierMat as StdMat).needsUpdate = true;
      });
    }

    // d) store for toggle
    if (meshes.length) store.set(nk, { meshes, carrierMat });
  }

  renderer.compile(scene, camera);

  // ─────────────────────────────────────────────────────────────────────────
  // TOGGLE — called whenever the UI switch changes
  // ─────────────────────────────────────────────────────────────────────────
  return function toggleFurniture(visible: boolean): void {
    store.forEach(({ meshes, carrierMat }) => {
      if (visible) {
        // Furniture ON → restore each mesh's original key material
        meshes.forEach(({ mesh, originalMat }) => {
          mesh.material = originalMat;
          (originalMat as StdMat).needsUpdate = true;
        });
      } else {
        // Furniture OFF → apply carrier mat
        if (!carrierMat) return;
        meshes.forEach(({ mesh }) => {
          mesh.material = carrierMat!;
          (carrierMat as StdMat).needsUpdate = true;
        });
      }
    });

    // Furniture group visibility (hide/show the geometry).
    //
    // Match the group name the SAME way materials are matched (`matchesKey`):
    // exact after normalisation, plus numbered duplicates (kitchen001…). We
    // deliberately do NOT substring-`includes` here — that made a "kitchen"
    // group also swallow "kitchen door" (normalised "kitchendoor" contains
    // "kitchen"), hiding the door whenever the kitchen group toggled. Exact
    // matching keeps siblings like the kitchen door visible while still
    // hiding the kitchen group (and its real children via the inner traverse).
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
