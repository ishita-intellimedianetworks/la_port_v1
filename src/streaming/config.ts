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
import type { StreamConfig, StreamHideRule } from "@/config/schema";

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
  /** Mount every chunk at this tier regardless of its distance band. The bands
   *  still decide what loads and what unloads — see `StreamConfig.forceTier`. */
  forceTier?: Tier;
  /** Chunks these rules match are never loaded in this view. Resolved to a set
   *  of chunk ids by `ChunkManager`, which is the only place the manifest and
   *  `materials.json` are both in hand. Empty for the ground and aerial
   *  configs — this is the dollhouse hiding the backdrop planes. */
  hide: StreamHideRule[];
  /** Distance fog. The reason the download radius can be small: geometry fades
   *  into the backdrop before the unload boundary instead of vanishing at it.
   *  `color` is normally UNSET, in which case StreamFog tracks the live
   *  `scene.background` — this app crossfades that between the dollhouse black
   *  and the first-person sky, so the fog can never disagree with the backdrop
   *  it dissolves into, not even mid-fade. Set it to pin a fixed hex. */
  fog: { enabled: boolean; start: FogStart; color?: string };
}

// Where the baked chunk set is served from. TWO env vars, because a published
// prefix does not have to be spelled like the local one.
//
//   NEXT_PUBLIC_STREAM_BASE   the COMPLETE base, used verbatim. Nothing is
//                             appended — it already names the asset folder.
//   NEXT_PUBLIC_ASSET_BASE    a ROOT that `<slug>/assets/` is appended to.
//                             Defaults to `/assets`, i.e. the copy under
//                             public/ (gitignored).
//
// The complete form wins when both are set, and exists because the two names
// genuinely diverge: this bake calls itself `portla-c5-v5-obj` (it is
// `manifest.model`, and the folder under public/ matches) but is published at
// `.../la-port/v5-obj/assets/`. No root + slug can compose that, and renaming
// the slug to suit the CDN would break the local path and disagree with the
// manifest. Either source must allow cross-origin GET; the S3 prefix above
// answers `Access-Control-Allow-Origin: *`.
const STREAM_BASE_FULL = process.env.NEXT_PUBLIC_STREAM_BASE;
const ASSET_ROOT = (process.env.NEXT_PUBLIC_ASSET_BASE ?? "/assets").replace(/\/+$/, "");

/** Public URL base for the baked chunk set, ending in a slash. */
export const STREAM_ASSET_BASE = STREAM_BASE_FULL
  ? `${STREAM_BASE_FULL.trim().replace(/\/+$/, "")}/`
  : `${ASSET_ROOT}/${scene.stream.slug}/assets/`;

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
    forceTier: m.forceTier,
    hide: m.hide ?? [],
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

/** The GROUND config on this device — what a person standing in the terminal
 *  streams with. The other two over the same manifest are
 *  `resolveAerialConfig` (the elevated layout framings) and
 *  `resolveDollhouseConfig` (the overview, which is selected by view rather
 *  than by camera height). */
export function resolveStreamConfig(profile?: "mobile" | "desktop"): StreamingConfig {
  return (profile ?? detectProfile()) === "mobile" ? mobileProfile(GROUND) : GROUND;
}

// =============================================================================
// AERIAL PROFILE — the second strategy over the SAME manifest.
//
// The ground bands assume the camera is IN the terminal. Every `layouts[]`
// camera here is a framing shot 54-412 m up and up to 2.8 km out, and at those
// distances the ground bands load nothing but the two district-sized ground
// planes: measured over the ten layouts, L01/L02/L03/L07 each resolved just
// 2 chunks of 831 inside the 990 m unload radius, which is why the shot framed
// empty sky.
//
// What makes the fix cheap is the far tier: the ENTIRE model at `far` is 831
// chunks / 22.0 MB encoded / 11.02 M triangles, and all 70 images at the 128 px
// rung come to 0.1 MB. So an unload radius that spans the whole 15 x 10 km
// district costs ~22 MB resident — less than the ground config's own 33 MB
// ceiling. There is no version of this that needs a second asset set.
//
// Authored as a partial override of `stream`, so anything not named here tracks
// the ground numbers automatically.
// =============================================================================

/** Merge `stream.aerial` over `stream` and resolve, or null when no aerial
 *  block is authored (in which case the swap never happens). */
function buildAerial(): StreamingConfig | null {
  const a = RAW.aerial;
  if (!a) return null;
  return toStreamingConfig({
    ...RAW,
    tiers: {
      near: a.tiers?.near ?? RAW.tiers.near,
      mid: a.tiers?.mid ?? RAW.tiers.mid,
      far: a.tiers?.far ?? RAW.tiers.far,
    },
    streaming: { ...RAW.streaming, ...a.streaming },
    cache: { ...RAW.cache, ...a.cache },
    fog: { ...RAW.fog, ...a.fog },
  });
}

const AERIAL: StreamingConfig | null = buildAerial();

/** The two heights that switch between the configs, or null when no aerial
 *  block is authored. Two of them so a camera resting on the line cannot flip
 *  the config every tick. */
export const AERIAL_SWITCH: { enterAbove: number; exitBelow: number } | null = RAW.aerial
  ? { enterAbove: RAW.aerial.enterAboveMetres, exitBelow: RAW.aerial.exitBelowMetres }
  : null;

/**
 * The config for an elevated framing camera, or null when `stream.aerial` is
 * absent.
 *
 * The mobile profile is applied here too, but ONLY to the texture rungs and the
 * per-tick load budget — never to the distances. Shrinking an aerial band is
 * self-defeating: the whole point of the band is to reach the terminal from
 * outside it, and a phone that pulls it in re-creates the empty-sky shot the
 * block exists to fix. The bytes it would have saved are not there to save
 * anyway — the far tier is 22 MB for the entire model.
 */
export function resolveAerialConfig(profile?: "mobile" | "desktop"): StreamingConfig | null {
  if (!AERIAL) return null;
  if ((profile ?? detectProfile()) !== "mobile") return AERIAL;
  const rung = (px: number) => Math.max(128, Math.round((px * MOBILE.rungScale) / 128) * 128);
  return {
    ...AERIAL,
    texRung: {
      near: rung(AERIAL.texRung.near),
      mid: rung(AERIAL.texRung.mid),
      far: rung(AERIAL.texRung.far),
    },
    maxLoadsPerTick: MOBILE.loadsPerTick,
  };
}

// =============================================================================
// DOLLHOUSE PROFILE — the third strategy over the same manifest.
//
// The overview is a single fixed vantage looking at the whole zone from the
// air. Adaptive banding has nothing to give it: the view cone covers
// everything, so the frustum cull buys nothing, and any band that resolves to
// `near` spends bytes on detail nobody up here can see. So the dollhouse block
// authors near/mid at 0 and lets EVERY chunk fall through to `far` — the
// coarsest geometry LOD and the 128 px texture rung, which is the whole model
// for about 22 MB encoded.
//
// It is also the same 22 MB the walking view wants first: the manager keeps its
// decoded-chunk cache across a `setConfig` swap, so entering first person
// re-mounts from memory and only downloads what the near bands add on top.
//
// The hide rules are resolved by ChunkManager, not here — matching a material
// name needs `materials.json`, which is fetched at runtime.
// =============================================================================

/** Merge `stream.dollhouse` over `stream` and resolve, or null when no
 *  dollhouse block is authored (the overview then streams with whatever the
 *  camera's height selects, like any other elevated camera). */
function buildDollhouse(): StreamingConfig | null {
  const d = RAW.dollhouse;
  if (!d) return null;
  return toStreamingConfig({
    ...RAW,
    tiers: {
      near: d.tiers?.near ?? RAW.tiers.near,
      mid: d.tiers?.mid ?? RAW.tiers.mid,
      far: d.tiers?.far ?? RAW.tiers.far,
    },
    streaming: { ...RAW.streaming, ...d.streaming },
    cache: { ...RAW.cache, ...d.cache },
    fog: { ...RAW.fog, ...d.fog },
    forceTier: d.forceTier ?? RAW.forceTier,
    hide: d.hide ?? RAW.hide,
  });
}

const DOLLHOUSE: StreamingConfig | null = buildDollhouse();

/**
 * The config for the dollhouse overview, or null when `stream.dollhouse` is
 * absent.
 *
 * The mobile profile touches only the per-tick load budget. The texture rungs
 * are already at the bottom of the ladder and the distances are what make the
 * view whole — shrinking either would hand a phone a half-built model, and
 * there are no bytes to save: the entire far tier is ~22 MB.
 */
export function resolveDollhouseConfig(profile?: "mobile" | "desktop"): StreamingConfig | null {
  if (!DOLLHOUSE) return null;
  if ((profile ?? detectProfile()) !== "mobile") return DOLLHOUSE;
  return { ...DOLLHOUSE, maxLoadsPerTick: MOBILE.loadsPerTick };
}

/**
 * Where the fog fade starts and ends, in metres. Ported from LA_PORT_ADAPTIVE's
 * `SceneFog`, arithmetic unchanged.
 *
 * `far` lands just INSIDE the unload radius (x0.98) rather than on it, so
 * geometry is fully faded out before it is evicted — a chunk sitting exactly on
 * the line would otherwise flicker between visible and absent as the camera
 * jitters across the boundary.
 *
 * `near` is where the fade BEGINS. Naming a band is usually what you want,
 * because it then retunes itself whenever the bands move; a number is that
 * fraction of `far`. Start it too close and broad surfaces wash out into the
 * sky long before the boundary — measured on this model, a fade starting at
 * 0.35 made the bridge DECK vanish into the haze while its thin dark cables
 * survived, which reads as missing geometry rather than as distance.
 *
 * Returns null when this config has fog switched off.
 */
export function fogRange(c: StreamingConfig): { near: number; far: number } | null {
  if (!c.fog.enabled) return null;
  const far = c.unloadDist * 0.98;
  const bands: Record<string, number> = {
    near: c.nearDist,
    mid: c.midDist,
    // Halfway between the mid and far edges — far enough out that everything
    // you are meant to read stays crisp, close enough that the fade has real
    // depth to work in and covers what the far band does at its limits.
    midfar: (c.midDist + c.farDist) / 2,
    far: c.farDist,
  };
  const s = c.fog.start;
  const start = typeof s === "number" ? far * s : bands[s] ?? c.farDist;
  // near must sit at least a metre inside far, and never below 1.
  return { near: Math.max(1, Math.min(start, far - 1)), far };
}
