/**
 * The shapes of the baked asset set: manifest.json, materials.json, tex.json.
 *
 * Ported verbatim from LA_PORT_ADAPTIVE's `src/runtime/types.ts` — this is the
 * wire contract between that repo's bake and this repo's runtime, so it must
 * not drift on one side only.
 */
import type { Tier } from "./config";

export interface ChunkLod {
  tier: Tier;
  url: string; // relative to assetBase
  tris: number;
  bytes: number;
}
export interface ChunkEntry {
  id: string;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  center: [number, number, number];
  radius: number;
  materials: number[];
  lods: ChunkLod[];
  /** Instanced placements owned by this chunk: [paletteEntry, firstInstance,
   *  count] indexing instances.bin. Present only on models baked by
   *  the instanced bake — absent everywhere else, which is what keeps
   *  the instancing path inert for the existing bakes. A fully-instanced chunk
   *  has no `lods` at all: it contributes placements and nothing else. */
  inst?: [number, number, number][];
  instCount?: number;
}
export interface Manifest {
  model: string;
  version: number;
  budget: number;
  tiers: Tier[];
  worldMin: [number, number, number];
  worldMax: [number, number, number];
  chunks: ChunkEntry[];
  /** Animated subtrees lifted out of the chunks, with the clips that drive them.
   *  Only models baked by the instanced bake with `animation.enabled`
   *  have this; absent everywhere else. */
  animated?: { url: string; clips: string[] };
}

export interface TexSlot {
  image: number;
  /** Which UV set to sample: 0 -> TEXCOORD_0, 1 -> TEXCOORD_1. */
  uv: number;
  wrapS?: number; // glTF enum: 10497 REPEAT, 33071 CLAMP_TO_EDGE, 33648 MIRRORED
  wrapT?: number;
  /** KHR_texture_transform, when the source declared one for this slot. */
  transform?: {
    offset: [number, number];
    scale: [number, number];
    rotation: number;
    texCoord: number | null;
  };
}
export interface MaterialDef {
  index: number;
  name: string;
  baseColorFactor: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissiveFactor: [number, number, number];
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff: number;
  doubleSided: boolean;
  transmission?: number;
  ior?: number;
  thickness?: number;
  attenuationColor?: [number, number, number] | null;
  attenuationDistance?: number | null;
  textures: {
    baseColor: TexSlot | null;
    normal: TexSlot | null;
    metallicRoughness: TexSlot | null;
    occlusion: TexSlot | null;
    emissive: TexSlot | null;
  };
}

export interface TexRung {
  px: number;
  tag: string;
  url: string; // WebP (RGBA-decoded on the GPU) — universal fallback
  bytes: number;
  ktx2?: string; // KTX2/Basis (stays GPU-compressed: ~4-8× less VRAM). Preferred when supported.
  ktx2Bytes?: number;
}
export interface TexImage {
  id: number;
  w: number;
  h: number;
  kind: "color" | "normal" | "data" | "emissive";
  srcMime: string;
  rungs: TexRung[];
}
export interface TexManifest {
  rungs: (string | number)[];
  images: TexImage[];
}
