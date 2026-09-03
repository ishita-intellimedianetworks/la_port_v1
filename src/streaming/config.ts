/**
 * The browser side of `<site>.json › stream`.
 *
 * Ported from LA_PORT_ADAPTIVE's `src/runtime/config.ts`, with one change of
 * ownership: there, the numbers lived in `models.config.json` because the BAKE
 * scripts read them too. This app does not bake — it consumes an already-baked
 * asset set — so the numbers live in the site document like every other tunable
 * here, and the bake side of the contract stays in the adaptive repo.
 *
 * ONE `stream` BLOCK PER MODEL, in that model's own file: `config/sites/v1.json`
 * for `/`, `v2.json` for `/v2`, `v3.json` for `/v3`. Nothing is merged across
 * them — this file used to layer a `streamV2` partial over `stream` at import,
 * which meant a retune of one bake silently retuned the others.
 *
 * This file contains NO tuning values of its own. All it does is translate
 * the site file's vocabulary into the shape `ChunkManager` consumes, and apply
 * the mobile profile.
 *
 *     near = good quality · mid = medium · far = low · beyond far = not loaded
 *
 * Distances are metres to the chunk SURFACE: distance(camera, chunk.center)
 * minus chunk.radius, clamped at 0. The manager walks them top-down and takes
 * the FIRST match, so nearDist < midDist < farDist < unloadDist must hold.
 */
import { SITES, type SiteId } from "@/config";
import { weakGpuProbe } from "./memory";
import type { StreamConfig, StreamHideRule } from "@/config/schema";

export type Tier = "near" | "mid" | "far";

/**
 * How much this machine is asked to hold.
 *
 *   "desktop"  the authored numbers, unmodified.
 *   "low"      a weak GPU or a slow CPU behind a normal-looking browser — the
 *              case that used to read as "desktop" on every cheap signal and
 *              was then handed whole-model residency on shared video memory.
 *   "mobile"   a phone or small tablet.
 *
 * Ordered by how much is taken away, and every consumer treats it as an ordered
 * scale: whatever "low" gives up, "mobile" gives up at least as much.
 */
export type DeviceProfile = "mobile" | "low" | "desktop";

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
  /**
   * How GEOMETRY is managed. Textures adapt by distance either way.
   *
   *   "streamed"  the original: chunks mount, re-tier and unload by distance.
   *   "resident"  every chunk is loaded ONCE at `residentTier` and never
   *               unloaded, re-tiered or culled. Nothing appears or disappears
   *               after the loading screen; only texture rungs change, and
   *               those swap in place so they never flash.
   *
   * Ported from the LA_PORT_ADAPTIVE runtime, where it is the default for this
   * model. Streaming geometry across a site whose entire near tier is a couple
   * of dozen megabytes buys nothing and costs every visible artefact: chunks
   * arriving one at a time, tier swaps mid-walk, and a resident-byte governor
   * evicting geometry that is immediately re-requested.
   */
  geometryMode: "streamed" | "resident";
  /** The single LOD "resident" mounts. Geometry LOD is nearly free on this
   *  model — the three tiers are within ~5% of each other on triangles — so the
   *  cheap tiers save download bytes, not frame time. Default "near". */
  residentTier: Tier;
  /**
   * Free the JS-heap copy of a chunk's vertex data once the GPU has it
   * ("resident" only).
   *
   * DEFAULT FALSE HERE, and that is a deliberate divergence from the runtime
   * this was ported from, where it defaults true and is described as the thing
   * that makes whole-model residency affordable.
   *
   * It cannot be true in this app. There, the only raycast target is the
   * navmesh; here `bvh-raycast.ts` builds a `MeshBVH` from
   * `geometry.attributes.position` the first time a ray reaches a chunk, and
   * that backs double-click walk-to, the interior portals and the route
   * ribbon's per-frame ground probe. Freeing nulls exactly that array, so
   * picking would break — silently, and only on whichever chunk the user
   * happened to click.
   *
   * Turn it on only for a build that has given up picking streamed geometry.
   */
  freeCpuArrays: boolean;
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
  /** Where three's transmission pass may run — see `StreamConfig.render`. The
   *  single biggest frame-time lever in this file: one visible transmissive
   *  material re-renders the whole opaque scene every frame. */
  transmission: "off" | "near" | "all";
  /** Dress a chunk at the smallest rung so it can appear immediately, and
   *  promote it to its tier's rung in the background. */
  progressiveTex: boolean;
  /** Ceiling on texture upgrades started per tick, nearest first. */
  texUpgradesPerTick: number;
  /** Whether the pixel ratio follows the frame rate at all. Off, `maxDpr` is a
   *  fixed ceiling and `AdaptiveQuality` is not mounted. */
  adaptiveDpr: boolean;
  /** Ceiling on canvas pixel ratio. Read by `AdaptiveQuality`, not by
   *  `ChunkManager` — it travels here because it is per-VIEW like the bands
   *  are, and the dollhouse and the walking view can afford different ones. */
  maxDpr: number;
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
//   NEXT_PUBLIC_STREAM_BASE   the COMPLETE base, used verbatim. Nothing is
//                             appended — it already names the asset folder.
//   NEXT_PUBLIC_ASSET_BASE    a ROOT that `<slug>/assets/` is appended to.
//                             Defaults to `/assets`, i.e. the copy under
//                             public/ (gitignored).
// The complete form wins when both are set, and exists because the two names
// genuinely diverge: this bake calls itself `portla-c5-v5-obj` (it is
// `manifest.model`, and the folder under public/ matches) but is published at
// `.../la-port/v5-obj/assets/`. No root + slug can compose that, and renaming
// the slug to suit the CDN would break the local path and disagree with the
// manifest. Either source must allow cross-origin GET; the S3 prefix above
// answers `Access-Control-Allow-Origin: *`.
// ONE VARIABLE PER BAKE. They are read as separate literal expressions, not
// composed from the variant id, because Next inlines `process.env.NEXT_PUBLIC_*`
// by STATIC TEXT MATCH at build time — `process.env[`..._${id}`]` compiles to a
// lookup on an object that does not exist in the browser and silently yields
// undefined.
const STREAM_BASE_V1 = process.env.NEXT_PUBLIC_STREAM_BASE;
const STREAM_BASE_V2 = process.env.NEXT_PUBLIC_STREAM_BASE_V2;
const STREAM_BASE_V3 = process.env.NEXT_PUBLIC_STREAM_BASE_V3;
const ASSET_ROOT = (process.env.NEXT_PUBLIC_ASSET_BASE ?? "/assets").replace(/\/+$/, "");

const withSlash = (u: string) => `${u.trim().replace(/\/+$/, "")}/`;

/**
 * Where ONE bake is served from, ending in a slash.
 *
 * Three sources, most specific first:
 *
 *   NEXT_PUBLIC_STREAM_BASE      the published prefix for `/`,
 *   NEXT_PUBLIC_STREAM_BASE_V2   the one for `/v2`, and
 *   NEXT_PUBLIC_STREAM_BASE_V3   the one for `/v3`. THE SOURCE OF TRUTH: one
 *                                variable per bake, so all three live in `.env`
 *                                and a deploy can repoint any of them without a
 *                                code edit. They win over anything authored,
 *                                and NONE of them falls back to another
 *                                model's — an unset one drops to the local
 *                                staging path below and 404s, which is the loud
 *                                failure, rather than serving a different bake
 *                                under this route's name.
 *   `stream.assetBase`           a per-block URL in the site file. Still supported
 *                                and still typed, but deliberately UNAUTHORED
 *                                on this site — two places holding the same URL
 *                                is two places to drift.
 *   NEXT_PUBLIC_ASSET_BASE       a ROOT that `<slug>/assets/` is appended to,
 *                                defaulting to `/assets` — the local staging
 *                                copy under public/, which is gitignored. This
 *                                is the LAST resort: with no env var set, a
 *                                route 404s its chunk fetches here rather than
 *                                silently streaming the other bake.
 *
 * Whichever wins must allow cross-origin GET.
 */
function assetBaseFor(id: StreamVariantId, block: { slug: string; assetBase?: string }): string {
  const fromEnv = id === "v3" ? STREAM_BASE_V3 : id === "v2" ? STREAM_BASE_V2 : STREAM_BASE_V1;
  if (fromEnv) return withSlash(fromEnv);
  if (block.assetBase) return withSlash(block.assetBase);
  return `${ASSET_ROOT}/${block.slug}/assets/`;
}

/** the site file's vocabulary -> the shape ChunkManager consumes. The only place
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

    geometryMode: s.geometry ?? "streamed",
    residentTier: s.residentTier ?? "near",
    // Not `s.freeCpuArrays ?? true` as upstream has it — see the field doc.
    // A bake that asks for it explicitly still gets it, so the flag stays
    // usable, but nothing turns it on by omission.
    freeCpuArrays: s.freeCpuArrays ?? false,

    fog: m.fog,
    transmission: m.render.transmission,
    progressiveTex: m.render.progressiveTextures,
    texUpgradesPerTick: m.render.texUpgradesPerTick,
    adaptiveDpr: m.render.adaptiveDpr,
    maxDpr: m.render.maxDpr,
    useKtx2: true,

    frustumCull: s.frustumCull,
    frustumMargin: s.frustumMarginMetres,
    alwaysLoadDist: s.alwaysLoadRadiusMetres,
    cullGraceTicks: s.cullGraceTicks,
    forceTier: m.forceTier,
    hide: m.hide ?? [],
  };
}

/**
 * Which bake a route streams — the SAME id the route picks its site with, and
 * deliberately so: a bake and the document that describes it are one choice.
 * `v1` is `sites/v1.json > stream`, `v2` is `sites/v2.json > stream`, `v3` is
 * `sites/v3.json > stream`. No merging, no fallback between them.
 */
export type StreamVariantId = SiteId;

/**
 * One bake, fully resolved: where it is served from, and the three strategies
 * over its manifest.
 *
 * These used to be module-level constants over a single `stream` block, which
 * is exactly what stopped two bakes coexisting — the asset base in particular
 * was a `const` derived from an env var, so the whole app could only ever point
 * at one of them. Everything is per-model now, and the route chooses.
 */
export interface StreamVariant {
  id: StreamVariantId;
  /** Ends in a slash. Everything the streamer fetches hangs off it. */
  assetBase: string;
  /** The navmesh travels WITH the chunks, so it follows the variant too — a
   *  route walking on the other bake's navmesh is a subtle, nasty bug. */
  navmeshUrl: string;
  ground: StreamingConfig;
  aerial: StreamingConfig | null;
  dollhouse: StreamingConfig | null;
  /** The two heights that switch ground <-> aerial, or null when this variant
   *  authors no aerial block. */
  aerialSwitch: { enterAbove: number; exitBelow: number } | null;
}

function buildVariant(id: StreamVariantId, raw: StreamConfig): StreamVariant {
  const assetBase = assetBaseFor(id, raw);
  return {
    id,
    assetBase,
    navmeshUrl: `${assetBase}navmesh.glb`,
    ground: toStreamingConfig(raw),
    aerial: buildAerial(raw),
    dollhouse: buildDollhouse(raw),
    aerialSwitch: raw.aerial
      ? { enterAbove: raw.aerial.enterAboveMetres, exitBelow: raw.aerial.exitBelowMetres }
      : null,
  };
}

/** Every bake, resolved once, each straight out of its own site file. `/`
 *  reads v1, `/v2` reads v2, `/v3` reads v3, and there is nothing left that
 *  could make one of them an alias of another. */
export const STREAM_VARIANTS: Record<StreamVariantId, StreamVariant> = {
  v1: buildVariant("v1", SITES.v1.scene.stream),
  v2: buildVariant("v2", SITES.v2.scene.stream),
  v3: buildVariant("v3", SITES.v3.scene.stream),
};

export function streamVariant(id: StreamVariantId): StreamVariant {
  return STREAM_VARIANTS[id];
}

// MOBILE PROFILE — a proportional shrink, not a second set of magic numbers.
// Phones enforce a VRAM ceiling of a few hundred MB before killing the WebGL
// context, so the loaded bubble and the texture resolution come down together.
// Deriving it from the authored numbers means it tracks any retune
// automatically — there is nothing here to keep in sync.
const MOBILE = {
  /** WHAT A PHONE GIVES UP IS QUALITY, NOT DISTANCE.
   *
   *  This block used to shrink `far` — 0.55, then briefly 0.28 — on the theory
   *  that the loaded radius was what put a phone over its ceiling. Measured
   *  properly, it is not, and the two assumptions behind that were both wrong:
   *
   *  1. THE TIERS COST THE SAME IN MEMORY. Sampled over 45 chunks, decoded
   *     bytes are near 17.8 MB / mid 17.3 MB / far 14.3 MB for the same set —
   *     within 20%. The decode RATIO differs wildly (near 2.5x, mid 12.5x, far
   *     13.1x) because the cheap rungs are quantised harder on the wire, but
   *     they land in the same place in memory: ~24-42 bytes per triangle, and
   *     the three tiers are within 32% of each other on triangles. A cheap tier
   *     buys DOWNLOAD (5.4 MB -> 1.0 MB on a big chunk) and draw cost. It does
   *     not buy VRAM, so no amount of LOD makes a radius affordable.
   *  2. THE FRUSTUM CULL DOES THE WORK. The camera is 35 deg vertical, so
   *     beyond `alwaysLoadRadiusMetres` only a narrow cone loads. At the full
   *     authored 900 m the resident set measures 77 MB median / 110 MB p90
   *     including textures — under the 120 MB mobile ceiling. The 360-degree
   *     figure is 168 MB, which a fast spin can approach and which is exactly
   *     what `effUnload` is there to trim.
   *
   *  So `far` is left ALONE, and the quality comes down instead: `mid` pulls in
   *  hard so that most of what is on screen resolves to the `far` rung, which
   *  is the cheapest geometry and the 128 px texture. Distant geometry stays
   *  coarse and PRESENT, which is the trade a port with 900 m sightlines wants
   *  — a shrunken radius reads as the world ending, and no fog setting hides
   *  it, because the fade then has only tens of metres to work in. */
  midScale: 0.4,
  farScale: 1,
  /** One rung down on every tier: less download AND less VRAM, and a small
   *  screen hides most of it. */
  rungScale: 0.5,
  /** RAISED FROM 1, because the set this has to fill grew. One per tick at the
   *  10 Hz streaming rate is 10 chunks a second, which was ample when a phone
   *  loaded ~80 chunks inside a 252 m bubble and is not when it loads 200-430
   *  inside the full 900 m one: the same setting that read as "smooth" then
   *  reads as "the distance never arrives" now, taking 20-43 s to complete.
   *  Four is ~5 s to a full frame at the median and ~11 s at the p90, and the
   *  decode is off the render thread — what actually costs a frame is the
   *  upload, which `flushReveals()` already batches per tick. */
  loadsPerTick: 4,
  /** A phone cannot pay for a second full scene render, and the stand-in alpha
   *  is indistinguishable on these materials. Forced, not scaled. */
  transmission: "off" as const,
  /** Half the upgrade wave: a small screen hides the preview rung for longer,
   *  and the network is the scarcer resource here. */
  texUpgradesScale: 0.5,
  /** DPR ceiling. `AdaptiveQuality` still steps DOWN from it under load; this
   *  is only where it starts. */
  maxDpr: 1.25,
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
    transmission: MOBILE.transmission,
    texUpgradesPerTick: Math.max(1, Math.round(c.texUpgradesPerTick * MOBILE.texUpgradesScale)),
    maxDpr: Math.min(c.maxDpr, MOBILE.maxDpr),
    // NO FOG OVERRIDE. The authored start band is honoured because `far` is
    // where the authored numbers put it — the fade keeps the full depth it was
    // tuned with. An earlier revision re-aimed it at "mid" to cover a shrunken
    // radius, which is what made the haze close in on a phone; the fix was to
    // stop shrinking the radius, not to move the fog.
    // A smaller bubble mounts fewer chunks, so the cache can be smaller too —
    // but it must still exceed the peak mounted count or the LRU does nothing.
    cacheLimit: Math.max(64, Math.round(c.cacheLimit * 0.4)),
    // NEVER hold the whole model on a phone. Residency drops the bands, the
    // frustum gate, the unload pass and the resident-byte governor — which is
    // every lever this function pulls — so a mobile profile under it would keep
    // the FULL near tier (8.3 M triangles on this bake) with nothing left to
    // bound it. Everything above would still be applied and none of it would
    // do anything.
    // Desktop keeps residency and its artefact-free fill; mobile falls back to
    // exactly the streaming behaviour it has today. This is the one place the
    // two profiles differ in KIND rather than in degree, which is why it is
    // here rather than authored per bake.
    geometryMode: "streamed" as const,
  };
}

// LOW PROFILE — the machine that is neither a phone nor a workstation.
//
// It exists because that machine used to get the HEAVIEST configuration in the
// app. Three probes decide how hard this page pushes — `isLowPower()` in
// shared/runtime (shadows, canvas DPR), `detectProfile()` here (the bands and
// the geometry mode) and `isWeakGpu()` in memory.ts (the ceilings) — and a
// 1366x768 laptop with eight cores, 8 GB of RAM, a fine pointer and an Intel
// iGPU passes the first two as a desktop. So it kept shadows, DPR 1.5 and MSAA,
// and `geometry: "resident"` handed it the entire near tier: 9.38 M triangles,
// charged to the JS heap and to video memory at once. The one probe that got it
// right was the third, and `updateResident()` consults no budget at all.
//
// What "low" takes away is therefore mostly one thing — residency — plus enough
// band to make the streamed path fit the 192 MB a weak GPU is given. Everything
// else it leaves alone: the texture rungs stay near desktop, because textures
// are 14 MB of the problem here and geometry is 200.
const LOW = {
  /** Distance is NOT what this profile gives up — see the long note on
   *  MOBILE.midScale. A weak GPU is given 192 MB, and the full authored 900 m
   *  measures 82 MB median / 114 MB p90 at mobile rungs with the frustum cull
   *  in play, so the radius was never the thing over the line. */
  farScale: 1,
  /** Quality is. Mid pulls in to 150 m so most of the frame resolves to the
   *  `far` rung — same memory, ~5x less download, and the coarser geometry is
   *  the part a weak GPU actually feels. Less aggressive than mobile's 0.4
   *  because this is a full-size screen, where the drop is visible sooner. */
  midScale: 0.6,
  /** One rung down on `near` only (512 -> 384 rounds to 384 on the 128 ladder,
   *  and the bake has no 384 rung, so it lands on 256). mid and far are already
   *  at 256/128 and there is nothing there to win: the whole resident texture
   *  set is 21.7 MB at desktop rungs and 12 MB here. */
  rungScale: 0.75,
  /** Half the desktop wave. A weak GPU is usually behind a weak decoder, and
   *  the chunk decode is what competes with the frame. */
  loadsScale: 0.5,
  /** One visible transmissive material re-renders the whole opaque scene every
   *  frame — the single biggest frame-time item in this config, and the least
   *  missed. Forced, as on mobile. */
  transmission: "off" as const,
  /** DPR 1.0. On a 1366x768 panel this is the difference between a 2049x1152
   *  framebuffer and a 1366x768 one; with MSAA also off (see CanvasWithWrapper)
   *  that is ~85 MB of video memory down to ~8 MB. None of it is visible to
   *  `residentBytes()`, which is exactly why it has to be given up here rather
   *  than left for the streamer's governor to discover. */
  maxDpr: 1,
};

function lowProfile(c: StreamingConfig): StreamingConfig {
  const midDist = Math.round(c.midDist * LOW.midScale);
  const farDist = Math.round(c.farDist * LOW.farScale);
  const unloadDist = Math.round(farDist * (c.unloadDist / c.farDist));
  const rung = (px: number) => Math.max(128, Math.round((px * LOW.rungScale) / 128) * 128);
  return {
    ...c,
    midDist,
    farDist,
    unloadDist,
    textureDist: unloadDist,
    texRung: { near: rung(c.texRung.near), mid: rung(c.texRung.mid), far: rung(c.texRung.far) },
    maxLoadsPerTick: Math.max(1, Math.round(c.maxLoadsPerTick * LOW.loadsScale)),
    transmission: LOW.transmission,
    maxDpr: Math.min(c.maxDpr, LOW.maxDpr),
    // No fog override, for the reason given in mobileProfile: `far` has not
    // moved, so the authored fade still has its full depth to work in.
    // THE WHOLE POINT OF THIS PROFILE. Residency is not a setting of the
    // streaming path, it is a replacement for it: `updateResident()` returns
    // before the frustum gate, the pre-mount hard cap, the eviction pass and
    // the resident-byte governor. It is the right trade on a machine that can
    // hold the near tier, and it is why this one could not.
    geometryMode: "streamed" as const,
  };
}

/**
 * Which profile this machine gets. Runs only in the browser; returns "desktop"
 * during SSR so hydration is stable.
 *
 * Ordered most-constrained first, and the two tests answer different questions.
 * "mobile" is about the DEVICE CLASS — a phone is a phone whatever GPU is in
 * it, and it has a hard VRAM ceiling the browser enforces by killing the
 * context. "low" is about CAPABILITY on a machine that presents as a desktop,
 * which is why it reaches for the GPU string rather than for screen size: the
 * failing case is a full-size laptop whose every cheap signal says desktop.
 */
export function detectProfile(): DeviceProfile {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "desktop";
  const uaMobile = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (uaMobile === true) return "mobile";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)) return "mobile";
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof mem === "number" && mem <= 4;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const smallish = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 820;
  if (coarse && (smallish || lowMem)) return "mobile";
  // Three ways to be "low", any one of which is enough. The GPU probe is the
  // one that matters and the one that was missing; the other two catch a
  // machine whose renderer string is hidden (Firefox's resistFingerprinting
  // blanks it, and `weakGpuProbe` then answers "weak" anyway) or whose problem
  // is the CPU rather than the card.
  const slowCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (weakGpuProbe() || slowCpu || lowMem) return "low";
  return "desktop";
}

/** The GROUND config on this device — what a person standing in the terminal
 *  streams with. The other two over the same manifest are
 *  `resolveAerialConfig` (the elevated layout framings) and
 *  `resolveDollhouseConfig` (the overview, which is selected by view rather
 *  than by camera height). */
export function resolveStreamConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig {
  const ground = STREAM_VARIANTS[variant].ground;
  const p = profile ?? detectProfile();
  if (p === "mobile") return mobileProfile(ground);
  if (p === "low") return lowProfile(ground);
  return ground;
}

// AERIAL PROFILE — the second strategy over the SAME manifest.
// The ground bands assume the camera is IN the terminal. Every `layouts[]`
// camera here is a framing shot 54-412 m up and up to 2.8 km out, and at those
// distances the ground bands load nothing but the two district-sized ground
// planes: measured over the ten layouts, L01/L02/L03/L07 each resolved just
// 2 chunks of 831 inside the 990 m unload radius, which is why the shot framed
// empty sky.
// What makes the fix cheap is the far tier: the ENTIRE model at `far` is 831
// chunks / 22.0 MB encoded / 11.02 M triangles, and all 70 images at the 128 px
// rung come to 0.1 MB. So an unload radius that spans the whole 15 x 10 km
// district costs ~22 MB resident — less than the ground config's own 33 MB
// ceiling. There is no version of this that needs a second asset set.
// Authored as a partial override of `stream`, so anything not named here tracks
// the ground numbers automatically.

/** Merge `stream.aerial` over `stream` and resolve, or null when no aerial
 *  block is authored (in which case the swap never happens). */
function buildAerial(raw: StreamConfig): StreamingConfig | null {
  const a = raw.aerial;
  if (!a) return null;
  return toStreamingConfig({
    ...raw,
    tiers: {
      near: a.tiers?.near ?? raw.tiers.near,
      mid: a.tiers?.mid ?? raw.tiers.mid,
      far: a.tiers?.far ?? raw.tiers.far,
    },
    streaming: { ...raw.streaming, ...a.streaming },
    cache: { ...raw.cache, ...a.cache },
    fog: { ...raw.fog, ...a.fog },
    render: { ...raw.render, ...a.render },
  });
}

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
export function resolveAerialConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  const aerial = STREAM_VARIANTS[variant].aerial;
  if (!aerial) return null;
  const p = profile ?? detectProfile();
  if (p === "desktop") return aerial;
  // "low" gets the throughput and resolution clamps and nothing else. The
  // reasoning above applies to it verbatim — an aerial band that a weak GPU
  // pulls in re-creates the empty-sky shot the block exists to fix — and it has
  // even less to gain than a phone does, since its texture rungs barely move.
  if (p === "low") {
    return {
      ...aerial,
      maxLoadsPerTick: Math.max(1, Math.round(aerial.maxLoadsPerTick * LOW.loadsScale)),
      maxDpr: Math.min(aerial.maxDpr, LOW.maxDpr),
    };
  }
  const rung = (px: number) => Math.max(128, Math.round((px * MOBILE.rungScale) / 128) * 128);
  return {
    ...aerial,
    texRung: {
      near: rung(aerial.texRung.near),
      mid: rung(aerial.texRung.mid),
      far: rung(aerial.texRung.far),
    },
    maxLoadsPerTick: MOBILE.loadsPerTick,
  };
}

// DOLLHOUSE PROFILE — the third strategy over the same manifest.
// The overview is a single fixed vantage looking at the whole zone from the
// air. Adaptive banding has nothing to give it: the view cone covers
// everything, so the frustum cull buys nothing, and any band that resolves to
// `near` spends bytes on detail nobody up here can see. So the dollhouse block
// authors near/mid at 0 and lets EVERY chunk fall through to `far` — the
// coarsest geometry LOD and the 128 px texture rung, which is the whole model
// for about 22 MB encoded.
// It is also the same 22 MB the walking view wants first: the manager keeps its
// decoded-chunk cache across a `setConfig` swap, so entering first person
// re-mounts from memory and only downloads what the near bands add on top.
// The hide rules are resolved by ChunkManager, not here — matching a material
// name needs `materials.json`, which is fetched at runtime.

/** Merge `stream.dollhouse` over `stream` and resolve, or null when no
 *  dollhouse block is authored (the overview then streams with whatever the
 *  camera's height selects, like any other elevated camera). */
function buildDollhouse(raw: StreamConfig): StreamingConfig | null {
  const d = raw.dollhouse;
  if (!d) return null;
  return toStreamingConfig({
    ...raw,
    tiers: {
      near: d.tiers?.near ?? raw.tiers.near,
      mid: d.tiers?.mid ?? raw.tiers.mid,
      far: d.tiers?.far ?? raw.tiers.far,
    },
    streaming: { ...raw.streaming, ...d.streaming },
    cache: { ...raw.cache, ...d.cache },
    fog: { ...raw.fog, ...d.fog },
    render: { ...raw.render, ...d.render },
    forceTier: d.forceTier ?? raw.forceTier,
    hide: d.hide ?? raw.hide,
  });
}

/**
 * The config for the dollhouse overview, or null when `stream.dollhouse` is
 * absent.
 *
 * The mobile profile touches only the per-tick load budget. The texture rungs
 * are already at the bottom of the ladder and the distances are what make the
 * view whole — shrinking either would hand a phone a half-built model, and
 * there are no bytes to save: the entire far tier is ~22 MB.
 */
export function resolveDollhouseConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  const dollhouse = STREAM_VARIANTS[variant].dollhouse;
  if (!dollhouse) return null;
  const p = profile ?? detectProfile();
  if (p === "desktop") return dollhouse;
  if (p === "low") {
    return {
      ...dollhouse,
      maxLoadsPerTick: Math.max(1, Math.round(dollhouse.maxLoadsPerTick * LOW.loadsScale)),
      maxDpr: Math.min(dollhouse.maxDpr, LOW.maxDpr),
    };
  }
  return { ...dollhouse, maxLoadsPerTick: MOBILE.loadsPerTick };
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
  return { near: Math.max(1, Math.min(start, far - 1)), far };
}
