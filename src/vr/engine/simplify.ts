import * as THREE from "three";
import type { Tier } from "@/streaming/config";
import { vrStreamingOn } from "./stream";

interface Pass {
  ratio: number;
  error: number;
}

export const VR_SIMPLIFY = {
  minTriangles: 2000,
  sliceMs: 6,
  tiers: { far: { ratio: 0.25, error: 0.01 } } as Partial<Record<Tier, Pass>>,
  palette: { ratio: 0.35, error: 0.005 } as Pass,
} as const;

const DONE = "vrSimplified";

type Simplifier = (typeof import("meshoptimizer/simplifier"))["MeshoptSimplifier"];

let loading: Promise<Simplifier | null> | null = null;

function loadSimplifier(): Promise<Simplifier | null> {
  loading ??= import("meshoptimizer/simplifier")
    .then(async ({ MeshoptSimplifier }) => {
      if (!MeshoptSimplifier.supported) return null;
      await MeshoptSimplifier.ready;
      return MeshoptSimplifier;
    })
    .catch((e) => {
      console.warn("[vr] simplifier unavailable", e);
      return null;
    });
  return loading;
}

function positionsOf(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
}

function simplifyGeometry(simplifier: Simplifier, geometry: THREE.BufferGeometry, pass: Pass): void {
  if (geometry.userData[DONE]) return;
  geometry.userData[DONE] = true;
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  if (!index || !position || !index.array) return;
  const triangles = index.count / 3;
  if (triangles < VR_SIMPLIFY.minTriangles) return;
  const indices = Uint32Array.from(index.array as ArrayLike<number>);
  const target = Math.max(3, Math.floor((index.count * pass.ratio) / 3) * 3);
  const [out] = simplifier.simplify(indices, positionsOf(position), 3, target, pass.error, ["LockBorder"]);
  if (out.length === 0 || out.length >= index.count) return;
  const narrow = position.count <= 65535;
  geometry.setIndex(new THREE.BufferAttribute(narrow ? Uint16Array.from(out) : out, 1));
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function simplifyGeometries(geometries: THREE.BufferGeometry[], pass: Pass): Promise<void> {
  if (!vrStreamingOn()) return;
  const simplifier = await loadSimplifier();
  if (!simplifier) return;
  let sliceStart = performance.now();
  const seen = new Set<THREE.BufferGeometry>();
  for (const geometry of geometries) {
    if (seen.has(geometry)) continue;
    seen.add(geometry);
    try {
      simplifyGeometry(simplifier, geometry, pass);
    } catch (e) {
      console.warn("[vr] simplify failed", e);
    }
    if (performance.now() - sliceStart > VR_SIMPLIFY.sliceMs) {
      await yieldFrame();
      sliceStart = performance.now();
    }
  }
}

export async function simplifyChunk(group: THREE.Object3D, tier: Tier): Promise<void> {
  const pass = VR_SIMPLIFY.tiers[tier];
  if (!pass || !vrStreamingOn()) return;
  const geometries: THREE.BufferGeometry[] = [];
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) geometries.push(mesh.geometry);
  });
  await simplifyGeometries(geometries, pass);
}

export function simplifiedTriangles(tris: number, tier: Tier): number {
  const pass = VR_SIMPLIFY.tiers[tier];
  if (!pass || !vrStreamingOn() || tris < VR_SIMPLIFY.minTriangles) return tris;
  return Math.round(tris * pass.ratio);
}
