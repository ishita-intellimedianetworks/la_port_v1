/**
 * REAL-BYTE ACCOUNTING for the streamer.
 *
 * The thing this file exists to correct: `manifest.json`'s `lod.bytes` and
 * `tex.json`'s `rung.bytes` are ENCODED sizes — the Draco/meshopt and WebP file
 * sizes on the wire. Nothing in memory is that size. Measured on this bake
 * (see `site.json > stream._note`), 26.5 MB encoded decodes to 358 MB — a
 * factor of 13.5 — so a ceiling expressed in encoded bytes is off by more than
 * an order of magnitude and never fires.
 *
 * Everything here measures what is ACTUALLY held, from the decoded object
 * rather than from the manifest, so there is no ratio to keep calibrated.
 *
 * THREE POOLS, and why they are counted separately:
 *
 *   CPU  decoded BufferAttribute arrays sitting in the JS heap. three never
 *        frees these after upload, so a MOUNTED chunk is billed here AND in
 *        GPU — the same bytes, twice, in two different heaps. This is the
 *        single most under-counted cost in the old accounting.
 *   GPU  the vertex buffers currently uploaded, i.e. mounted chunks only.
 *        `unmount()` disposes these while the CPU copy stays cached.
 *   TEX  decoded texture memory. A WebP rung expands to RGBA8 + mips; a KTX2
 *        rung stays in its compressed block format, which is the whole reason
 *        to prefer it.
 *
 * Chrome's task-manager figure is roughly CPU (renderer process) + GPU + TEX
 * (GPU process), which is why a "34 MB" budget could show as 1.3 GB.
 */
import * as THREE from "three";

/** Bytes of JS heap a decoded chunk group holds: every BufferAttribute's typed
 *  array plus the index and any morph targets.
 *
 *  While the group is mounted the GPU holds a copy of the same figure, so this
 *  is charged to BOTH pools — see the header. Geometries are de-duplicated by
 *  identity because a chunk's meshes can share one. */
export function geometryBytes(root: THREE.Object3D): number {
  let n = 0;
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry || seen.has(m.geometry)) return;
    seen.add(m.geometry);
    const g = m.geometry;
    for (const a of Object.values(g.attributes)) {
      n += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
    }
    n += g.index?.array.byteLength ?? 0;
    for (const targets of Object.values(g.morphAttributes)) {
      for (const a of targets) n += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
    }
  });
  return n;
}

/** Decoded footprint of one texture, measured off the texture itself.
 *
 *  A KTX2/Basis texture carries its transcoded mip chain in `mipmaps[]`, so its
 *  real block-compressed size is readable exactly — that is the ~4-8x saving
 *  over WebP, and it is why this must not be estimated from the file size.
 *  A WebP decodes to RGBA8; three then generates the full mip chain, which adds
 *  a third on top. */
export function textureBytes(tex: THREE.Texture): number {
  const mips = (tex as THREE.CompressedTexture).mipmaps;
  if (Array.isArray(mips) && mips.length > 0) {
    let n = 0;
    for (const m of mips) n += (m as { data?: { byteLength: number } })?.data?.byteLength ?? 0;
    if (n > 0) return n;
  }
  const img = tex.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  if (!w || !h) return 0;
  return Math.round(w * h * 4 * (tex.generateMipmaps ? 4 / 3 : 1));
}

/** The three ceilings, in real megabytes. */
export interface MemoryBudget {
  /** Decoded groups held in the JS heap — mounted ones included, since three
   *  keeps their arrays. Bounding this is what replaces `cache.limitChunks`:
   *  a count cannot bound bytes when chunk radii span 3.6 m to 692 m. */
  cpuMB: number;
  /** Vertex buffers uploaded right now. Drives the unload radius. */
  gpuMB: number;
  /** Texture memory. Held across zero-ref periods (see the texture LRU in
   *  ChunkManager) rather than disposed the instant the last chunk leaves. */
  texMB: number;
}

/**
 * Is this an integrated / low-end GPU?
 *
 * THE TRAP THIS EXISTS TO AVOID: `navigator.deviceMemory` reports SYSTEM RAM,
 * and `cpuMB` is the only pool that measures. A laptop with 16 GB of RAM and an
 * Intel iGPU shares a slice of that RAM as video memory and will lose the WebGL
 * context long before a discrete card would — so sizing `gpuMB` from
 * `deviceMemory` hands exactly the wrong machine the largest budget. Sizing it
 * from the renderer string is coarse, but it is coarse about the right thing.
 *
 * `WEBGL_debug_renderer_info` is being restricted in some browsers; an
 * unavailable or unrecognised string falls through to `true`, i.e. the
 * conservative branch. Growing a budget back is cheap — a lost context is not.
 */
function isWeakGpu(renderer?: THREE.WebGLRenderer): boolean {
  if (!renderer) return true;
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
    if (!name) return true;
    const n = name.toLowerCase();
    const discrete = /\b(nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|\brx \d{3,}|arc a\d{3})/;
    if (/apple m\d/.test(n)) return false;
    if (discrete.test(n)) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Live scale applied to every GPU-side budget, cut when the context is actually
 * lost. Module-level rather than per-manager because the loss arrives on the
 * canvas, not on the streamer, and any manager alive at the time should shrink.
 * Never grows back on its own: a context loss is the one signal about this
 * machine's real ceiling that is not a guess, so it is kept for the session.
 */
let gpuScale = 1;

/** Called from the canvas's `webglcontextlost` handler. Each loss halves the
 *  GPU and texture budgets, to a floor of 1/8. */
export function degradeGpuBudget(): number {
  gpuScale = Math.max(0.125, gpuScale * 0.5);
  return gpuScale;
}

export function currentGpuScale(): number {
  return gpuScale;
}

/**
 * Budgets for this device.
 *
 * `cpuMB` is JS heap and scales with `deviceMemory`, which is the right signal
 * for it. `gpuMB`/`texMB` are VRAM and scale with the GPU probe instead — see
 * `isWeakGpu`. The desktop figures are deliberately far below what this machine
 * can probably take: the streamer fills whatever it is given, so an over-large
 * budget is not headroom, it is a promise to allocate.
 */
export function resolveBudget(
  profile: "mobile" | "desktop",
  renderer?: THREE.WebGLRenderer,
): MemoryBudget {
  const dm = typeof navigator !== "undefined"
    ? (navigator as unknown as { deviceMemory?: number }).deviceMemory
    : undefined;
  const weak = isWeakGpu(renderer);

  if (profile === "mobile") {
    // Both branches sit under the few-hundred-MB ceiling at which mobile
    // Safari/Chrome kill the context.
    const tight = weak || (typeof dm === "number" && dm <= 4);
    return tight
      ? { cpuMB: 96, gpuMB: 80, texMB: 40 }
      : { cpuMB: 160, gpuMB: 128, texMB: 56 };
  }

  const cpuMB = typeof dm === "number" && dm <= 4 ? 192 : typeof dm === "number" && dm >= 8 ? 448 : 288;
  // 192 MB is enough to hold the whole far tier (measured 178.7 MB) with the
  // frustum cull off, which is what the dollhouse overview needs; it is not
  // enough to also stack first person's near/mid on top, and the eviction loop
  // is what handles that.
  const gpu = weak ? { gpuMB: 192, texMB: 80 } : { gpuMB: 320, texMB: 128 };
  return { cpuMB, ...gpu };
}
