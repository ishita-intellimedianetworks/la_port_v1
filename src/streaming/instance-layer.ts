import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ChunkEntry } from "./types";

export class InstanceLayer {
  private group = new THREE.Group();
  /** One entry per palette primitive, flattened across palette entries. */
  private prims: {
    entry: number;
    geometry: THREE.BufferGeometry;
    matIdx: number;
    mesh: THREE.InstancedMesh | null;
    capacity: number;
  }[] = [];
  /** palette entry index -> indices into `prims`. */
  private byEntry: number[][] = [];
  private matrices: Float32Array | null = null;
  private loaded = false;
  private lastKey = "";
  private scratch = new THREE.Matrix4();

  constructor(
    private scene: THREE.Scene,
    private assetBase: string,
    private loader: GLTFLoader,
    /** Builds the material for a source material index (ChunkManager owns that). */
    private makeMaterial: (matIdx: number) => THREE.Material,
  ) {
    this.group.name = "instances";
    // The palette is world-space geometry placed by per-instance matrices, so the
    // group itself must never carry a transform.
    this.group.matrixAutoUpdate = false;
  }

  get active() {
    return this.loaded;
  }

  /** Fetch palette.glb + instances.bin. Returns false when the model has none. */
  async load(): Promise<boolean> {
    let gltf;
    try {
      gltf = await this.loader.loadAsync(this.assetBase + "palette.glb");
    } catch {
      return false;
    }
    const bin = await fetch(this.assetBase + "instances.bin");
    if (!bin.ok) return false;
    this.matrices = new Float32Array(await bin.arrayBuffer());

    let entry = 0;
    for (const node of gltf.scene.children) {
      const idxs: number[] = [];
      const meshes: THREE.Mesh[] = [];
      if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
      else node.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      for (const m of meshes) {
        const name = (m.material as THREE.Material)?.name ?? "";
        const matIdx = name.startsWith("mat_") ? parseInt(name.slice(4), 10) : -1;
        idxs.push(this.prims.length);
        this.prims.push({ entry, geometry: m.geometry, matIdx, mesh: null, capacity: 0 });
      }
      this.byEntry[entry] = idxs;
      entry++;
    }
    this.scene.add(this.group);
    this.loaded = true;
    return true;
  }

  sync(resident: ChunkEntry[]) {
    if (!this.loaded || !this.matrices) return;

    let key = "";
    for (const c of resident) if (c.inst) key += c.id + ",";
    if (key === this.lastKey) return;
    this.lastKey = key;

    const counts = new Int32Array(this.byEntry.length);
    for (const c of resident) {
      if (!c.inst) continue;
      for (const [pal, , n] of c.inst) counts[pal] += n;
    }

    const cursor = new Int32Array(this.byEntry.length);
    for (let e = 0; e < this.byEntry.length; e++) {
      const need = counts[e];
      for (const pi of this.byEntry[e] ?? []) {
        const p = this.prims[pi];
        if (need === 0) {
          if (p.mesh) { p.mesh.count = 0; p.mesh.visible = false; }
          continue;
        }
        if (!p.mesh || p.capacity < need) {
          const cap = Math.max(need, Math.ceil(need * 1.5), 8);
          const material = p.mesh ? (p.mesh.material as THREE.Material) : this.makeMaterial(p.matIdx);
          if (p.mesh) {
            this.group.remove(p.mesh);
            p.mesh.dispose();
          }
          const mesh = new THREE.InstancedMesh(p.geometry, material, cap);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          this.group.add(mesh);
          p.mesh = mesh;
          p.capacity = cap;
        }
        p.mesh.count = need;
      }
    }

    for (const c of resident) {
      if (!c.inst) continue;
      for (const [pal, start, n] of c.inst) {
        const targets = this.byEntry[pal];
        if (!targets) continue;
        const base = cursor[pal];
        for (let i = 0; i < n; i++) {
          this.scratch.fromArray(this.matrices, (start + i) * 16);
          for (const pi of targets) this.prims[pi].mesh?.setMatrixAt(base + i, this.scratch);
        }
        cursor[pal] += n;
      }
    }
    for (const p of this.prims) {
      if (!p.mesh || p.mesh.count === 0) continue;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.mesh.visible = true;
      p.mesh.computeBoundingSphere();
    }
  }

  /** Rebuild materials (used when the texture tier changes). */
  refreshMaterials() {
    for (const p of this.prims) {
      if (!p.mesh) continue;
      (p.mesh.material as THREE.Material).dispose();
      p.mesh.material = this.makeMaterial(p.matIdx);
    }
  }

  dispose() {
    for (const p of this.prims) {
      if (p.mesh) {
        this.group.remove(p.mesh);
        p.mesh.dispose();
        (p.mesh.material as THREE.Material).dispose();
      }
      p.geometry.dispose();
    }
    this.prims = [];
    this.byEntry = [];
    this.scene.remove(this.group);
    this.loaded = false;
  }

  stats() {
    let draws = 0, instances = 0;
    for (const p of this.prims) if (p.mesh && p.mesh.count > 0) { draws++; instances += p.mesh.count; }
    return { entries: this.byEntry.length, draws, instances };
  }
}
