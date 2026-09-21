import * as THREE from "three";
import type { DeviceProfile } from "./config";

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
  cpuMB: number;
  /** Vertex buffers uploaded right now. Drives the unload radius. */
  gpuMB: number;
  /** Texture memory. Held across zero-ref periods (see the texture LRU in
   *  ChunkManager) rather than disposed the instant the last chunk leaves. */
  texMB: number;
}

function looksWeak(name: string): boolean {
  if (!name) return true;
  const n = name.toLowerCase();
  const discrete = /\b(nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|\brx \d{3,}|arc a\d{3})/;
  if (/apple m\d/.test(n)) return false;
  if (discrete.test(n)) return false;
  return true;
}

/** The renderer string off a live context, however the browser exposes it. */
function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext
    ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "")
    : String(gl.getParameter(gl.RENDERER) ?? "");
}

function isWeakGpu(renderer?: THREE.WebGLRenderer): boolean {
  if (!renderer) return weakGpuProbe();
  try {
    return looksWeak(rendererName(renderer.getContext()));
  } catch {
    return true;
  }
}

let _probe: boolean | null = null;

export function weakGpuProbe(): boolean {
  if (_probe !== null) return _probe;
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null;
    if (!gl) return (_probe = true);
    const weak = looksWeak(rendererName(gl));
    // Hand the context back rather than waiting for GC — a page that has not
    // built its real renderer yet should not be holding a second one.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return (_probe = weak);
  } catch {
    return (_probe = true);
  }
}

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

export function resolveBudget(
  profile: DeviceProfile,
  renderer?: THREE.WebGLRenderer,
): MemoryBudget {
  const dm = typeof navigator !== "undefined"
    ? (navigator as unknown as { deviceMemory?: number }).deviceMemory
    : undefined;
  const weak = isWeakGpu(renderer);

  if (profile === "mobile") {
    const tight = weak || (typeof dm === "number" && dm <= 4);
    return tight
      ? { cpuMB: 176, gpuMB: 120, texMB: 40 }
      : { cpuMB: 224, gpuMB: 160, texMB: 56 };
  }

  const cpuMB = typeof dm === "number" && dm <= 4 ? 192 : typeof dm === "number" && dm >= 8 ? 448 : 288;
  const gpu = weak ? { gpuMB: 192, texMB: 80 } : { gpuMB: 320, texMB: 128 };
  return { cpuMB, ...gpu };
}
