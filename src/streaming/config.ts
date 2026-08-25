/**
 * The browser side of `site.json › stream`.
 *
 * Ported from LA_PORT_ADAPTIVE's `src/runtime/config.ts`, with one change of
 * ownership: there, the numbers lived in `models.config.json` because the BAKE
 * scripts read them too. This app does not bake — it consumes an already-baked
 * asset set — so the numbers live in `site.json` like every other tunable here,
 * and the bake side of the contract stays in the adaptive repo.
 *
 * This file contains NO tuning values of its own. All it does is translate
 * `site.json`'s vocabulary into the shape `ChunkManager` consumes, and apply
 * the mobile profile.
 *
 *     near = good quality · mid = medium · far = low · beyond far = not loaded
 *
 * Distances are metres to the chunk SURFACE: distance(camera, chunk.center)
 * minus chunk.radius, clamped at 0. The manager walks them top-down and takes
 * the FIRST match, so nearDist < midDist < farDist < unloadDist must hold.
 */
import { scene } from "@/config";
import type { StreamConfig } from "@/config/schema";

export type Tier = "near" | "mid" | "far";

/** Fallback order when a chunk lacks a requested tier (small chunks are baked
 *  near-only): take the next available tier in this order. Declared above the
 *  resolved config because that is built at module-init time and reads it. */
export const TIER_ORDER: Tier[] = ["near", "mid", "far"];

/** Which texture file a tier asks for.
 *   "ktx2" — prefer the GPU-compressed rung (~8x less VRAM, transcodes on load)
 *   "webp" — force the WebP rung (smallest download, decodes to RGBA8 on the GPU)
 *   "auto" — ktx2 when it exists and the GPU can transcode it, else webp
 *  A "ktx2" request falls back to webp per-rung when that rung was never baked,
 *  so it is always safe to set before the ktx stage has run. */
export type TexFormat = "auto" | "webp" | "ktx2";

/** Where the fog fade BEGINS. A band name retunes itself when the bands move;
 *  a number is that fraction of the unload radius. The fade always ENDS at the
 *  unload radius, so there is nothing to keep in sync. */
export type FogStart = number | "near" | "mid" | "midfar" | "far";

export interface StreamingConfig {
  nearDist: number;
  midDist: number;
  farDist: number;
  unloadDist: number;
  radiusScale: number;
  refRadius: number;
  hysteresis: number;
  texturedTiers: Tier[];
  texRung: Record<Tier, number>;
  texFormat: Record<Tier, TexFormat>;
  textureDist: number;
  maxLoadsPerTick: number;
  updateHz: number;
  cacheLimit: number;
  useKtx2: boolean;
  residentBudgetMB: number;
  frustumCull: boolean;
  frustumMargin: number;
  alwaysLoadDist: number;
  cullGraceTicks: number;
  /** Distance fog. The reason the download radius can be small: geometry fades
   *  into the backdrop before the unload boundary instead of vanishing at it.
   *  No colour here — SceneFog reads the LIVE `scene.background`, which this
   *  app crossfades between the dollhouse black and the first-person sky, so
   *  the fog can never disagree with the backdrop it dissolves into. */
  fog: { enabled: boolean; start: FogStart };
}

// Base URL for the baked assets; the slug appends `<slug>/assets/`. Set
// NEXT_PUBLIC_ASSET_BASE to choose the source: `/assets` serves the copy under
// public/, or point it at an S3/CDN base (which must allow GET from this origin).
const ASSET_ROOT = (process.env.NEXT_PUBLIC_ASSET_BASE ?? "/assets").replace(/\/+$/, "");

/** Public URL base for the baked chunk set, ending in a slash. */
export const STREAM_ASSET_BASE = `${ASSET_ROOT}/${scene.stream.slug}/assets/`;

/** site.json's vocabulary -> the shape ChunkManager consumes. The only place
 *  the two are translated. */
function toStreamingConfig(m: StreamConfig): StreamingConfig {
  const s = m.streaming;
  const unload = Math.round(m.tiers.far.distance * s.unloadBuffer);
  return {
    nearDist: m.tiers.near.distance,
    midDist: m.tiers.mid.distance,
    farDist: m.tiers.far.distance,
    unloadDist: unload,

    radiusScale: s.radiusScale,
    refRadius: s.refRadius,
    hysteresis: s.hysteresisMetres,

    // All three tiers are textured; resolution steps down with distance exactly
    // as the geometry LOD does. Set texturedTiers to [] to render everything
    // flat (colour factor only) — useful for isolating a texture problem.
    texturedTiers: ["near", "mid", "far"],
    texRung: { near: m.tiers.near.texture.px, mid: m.tiers.mid.texture.px, far: m.tiers.far.texture.px },
    texFormat: { near: m.tiers.near.texture.format, mid: m.tiers.mid.texture.format, far: m.tiers.far.texture.format },
    // Textures persist for the whole loaded range, so nothing inside the bubble
    // ever renders flat/dark. Equal to unloadDist by construction.
    textureDist: unload,

    maxLoadsPerTick: s.loadsPerTick,
    updateHz: s.updateHz,

    cacheLimit: m.cache.limitChunks,
    residentBudgetMB: m.cache.residentBudgetMB,

    fog: m.fog,
    // Inert until a ktx stage has run on the asset set; harmless before that.
    useKtx2: true,

    frustumCull: s.frustumCull,
    frustumMargin: s.frustumMarginMetres,
    alwaysLoadDist: s.alwaysLoadRadiusMetres,
    cullGraceTicks: s.cullGraceTicks,
  };
}

const RAW = scene.stream;

const GROUND: StreamingConfig = toStreamingConfig(RAW);

// =============================================================================
// MOBILE PROFILE — a proportional shrink, not a second set of magic numbers.
//
// Phones enforce a VRAM ceiling of a few hundred MB before killing the WebGL
// context, so the loaded bubble and the texture resolution come down together.
// Deriving it from the authored numbers means it tracks any retune
// automatically — there is nothing here to keep in sync.
// =============================================================================
const MOBILE = {
  /** Bands shrink toward the camera; near is left alone so what you are standing
   *  next to still looks right. */
  midScale: 0.75,
  farScale: 0.55,
  /** One rung down on every tier: less download AND less VRAM, and a small
   *  screen hides most of it. */
  rungScale: 0.5,
  /** One chunk per tick — the smoothest fill on a weak CPU/GPU. */
  loadsPerTick: 1,
};

function mobileProfile(c: StreamingConfig): StreamingConfig {
  const midDist = Math.round(c.midDist * MOBILE.midScale);
  const farDist = Math.round(c.farDist * MOBILE.farScale);
  const unloadDist = Math.round(farDist * (c.unloadDist / c.farDist));
  const rung = (px: number) => Math.max(128, Math.round((px * MOBILE.rungScale) / 128) * 128);
  return {
    ...c,
    midDist,
    farDist,
    unloadDist,
    textureDist: unloadDist,
    texRung: { near: rung(c.texRung.near), mid: rung(c.texRung.mid), far: rung(c.texRung.far) },
    maxLoadsPerTick: MOBILE.loadsPerTick,
    // A smaller bubble mounts fewer chunks, so the cache can be smaller too —
    // but it must still exceed the peak mounted count or the LRU does nothing.
    cacheLimit: Math.max(64, Math.round(c.cacheLimit * 0.4)),
  };
}

/** Coarse client-side check for a phone / memory-constrained device. Runs only
 *  in the browser; returns "desktop" during SSR so hydration is stable. */
export function detectProfile(): "mobile" | "desktop" {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "desktop";
  const uaMobile = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (uaMobile === true) return "mobile";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)) return "mobile";
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof mem === "number" && mem <= 4;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const smallish = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 820;
  return coarse && (smallish || lowMem) ? "mobile" : "desktop";
}

/** The walking config on this device. This is the only config there is — the
 *  dollhouse draws `site.json > assets.modelUrl` as a single GLB and never
 *  streams, so there is no second strategy to resolve. */
export function resolveStreamConfig(profile?: "mobile" | "desktop"): StreamingConfig {
  return (profile ?? detectProfile()) === "mobile" ? mobileProfile(GROUND) : GROUND;
}

/** Where the fog fade starts and ends, in metres, for a resolved config. The
 *  fade always ends at the unload radius, so it retunes itself when the bands
 *  move. Returns null when this config has fog switched off. */
export function fogRange(c: StreamingConfig): { near: number; far: number } | null {
  if (!c.fog.enabled) return null;
  const s = c.fog.start;
  const start =
    s === "near" ? c.nearDist
    : s === "mid" ? c.midDist
    : s === "midfar" ? (c.midDist + c.farDist) / 2
    : s === "far" ? c.farDist
    : s * c.unloadDist;
  // A fade that starts at or past the boundary is not a fade — clamp it to
  // something with depth rather than letting the geometry pop again.
  return { near: Math.min(start, c.unloadDist * 0.95), far: c.unloadDist };
}
