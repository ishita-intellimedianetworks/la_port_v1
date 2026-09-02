import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ChunkEntry } from "./types";

/**
 * The shared-geometry half of a chunk.
 *
 * The bake stores a mesh that is placed many times ONCE, in local space, in
 * palette.glb, and stores each placement as a 4x4 in instances.bin. This class
 * owns the draw side of that: one THREE.InstancedMesh per palette primitive,
 * GLOBAL rather than per-chunk, whose instance list is rebuilt whenever the
 * resident chunk set changes.
 *
 * Global, not per-chunk, is the whole point. Measured on portla-c5-v3-inst,
 * 22,027 placements across 584 chunks:
 *   per-chunk InstancedMesh   3,595 -> 9,944 draws   (+177%)
 *   one shared InstancedMesh  3,595 -> 2,477 draws   (-31%)
 * Per-chunk multiplies the palette by the chunk count; sharing bounds instanced
 * draws by the PALETTE SIZE no matter how many chunks are loaded. Triangles fall
 * 13.03 M -> 8.06 M either way.
 *
 * Culling granularity is unchanged: an instance exists only while the chunk that
 * owns it is resident, so the streaming radius and frustum cull still decide what
 * is drawn — just one draw call per shape instead of one per shape per chunk.
 *
 * Entirely inert for a model with no palette: `load()` returns false and
 * `sync()` does nothing, so manifests without `inst` behave exactly as before.
 */
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

    // palette.glb holds one NODE per palette entry, in bake order, each with a
    // mesh whose primitives carry extras.mat. three splits a multi-primitive
    // glTF mesh into sibling Meshes, so walk children in order and group them.
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

  /**
   * Rebuild the instance buffers for exactly the chunks that are resident.
   *
   * Cheap enough to call every tick: it early-outs on an unchanged resident set,
   * and a full rebuild is a memcpy of at most ~22k matrices.
   */
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
          // visible=false, not just count=0. three's projectObject() early-outs
          // on an invisible object; a count-0 InstancedMesh with
          // frustumCulled=false was still walked, render-listed and sorted every
          // frame. At a typical ground camera most palette prims have no
          // resident placement, so this is the bulk of them.
          if (p.mesh) { p.mesh.count = 0; p.mesh.visible = false; }
          continue;
        }
        if (!p.mesh || p.capacity < need) {
          const cap = Math.max(need, Math.ceil(need * 1.5), 8);
          // Carry the material across a regrow. It does not depend on capacity,
          // and rebuilding it here LEAKED: InstancedMesh.dispose() frees the
          // instance buffers ONLY, never the material, so every growth step
          // orphaned a MeshStandardMaterial — and makeMaterial() also kicks off
          // a fresh texture load whose promise this call site drops on the
          // floor. Across a thousand palette prims and several growth steps
          // each, that was a one-way ratchet for the whole session.
          const material = p.mesh ? (p.mesh.material as THREE.Material) : this.makeMaterial(p.matIdx);
          if (p.mesh) {
            this.group.remove(p.mesh);
            p.mesh.dispose();
          }
          const mesh = new THREE.InstancedMesh(p.geometry, material, cap);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // A shared bounding volume IS meaningful, as long as it is rebuilt
          // whenever the instance list is — and sync() does exactly that, so the
          // sphere computed below is tight around the RESIDENT placements only.
          // three culls an InstancedMesh against object.boundingSphere
          // (Frustum.intersectsObject). This used to be frustumCulled=false,
          // which threw that away and submitted every palette prim every frame.
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
      // The instance list just changed, so the cached bounding sphere no longer
      // describes it — and it is now load-bearing twice over: three culls
      // against it, and InstancedMesh.raycast uses it as an early reject, where
      // a stale one that is too SMALL silently drops hits (the double-click
      // walk-to and the route ribbon's ground probe both raycast this layer).
      // MUST run after the matrix copy above: computeBoundingSphere() reads
      // instanceMatrix and honours `count`, so it is only correct once the
      // matrices are in.
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
