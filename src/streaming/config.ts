/**
 * The browser side of `<site>.json › stream`.
 *
 * One `stream` block per model, in that model's own file under `config/sites/`.
 * Nothing is merged across them. This file holds no tuning values of its own —
 * it translates the site file's vocabulary into the shape `ChunkManager`
 * consumes and applies the device profiles.
 *
 *     near = good quality · mid = medium · far = low · beyond far = not loaded
 *
 * Distances are metres to the chunk SURFACE: distance(camera, chunk.center)
 * minus chunk.radius, clamped at 0. The manager walks them top-down and takes
 * the first match, so nearDist < midDist < farDist < unloadDist must hold.
 */
import { SITES, type SiteId } from "@/config";
import { weakGpuProbe } from "./memory";
import type { StreamConfig, StreamHideRule } from "@/config/schema";

export type Tier = "near" | "mid" | "far";

/**
 * How much this machine is asked to hold.
 *
 *   "desktop"  the authored numbers, unmodified.
 *   "low"      a weak GPU or slow CPU behind a normal-looking browser.
 *   "mobile"   a phone or small tablet.
 *
 * An ordered scale: whatever "low" gives up, "mobile" gives up at least as much.
 */
export type DeviceProfile = "mobile" | "low" | "desktop";

/** Fallback order when a chunk lacks a requested tier (small chunks are baked
 *  near-only). Declared above the resolved config, which reads it at init. */
export const TIER_ORDER: Tier[] = ["near", "mid", "far"];

/** Which texture file a tier asks for.
 *   "ktx2" — prefer the GPU-compressed rung (~8x less VRAM, transcodes on load)
 *   "webp" — force the WebP rung (smallest download, decodes to RGBA8 on the GPU)
 *   "auto" — ktx2 when it exists and the GPU can transcode it, else webp
 *  A "ktx2" request falls back to webp per-rung when that rung was never baked,
 *  so it is always safe to set before the ktx stage has run. */
export type TexFormat = "auto" | "webp" | "ktx2";

/** Where the fog fade begins. A band name retunes itself when the bands move;
 *  a number is that fraction of the unload radius, where the fade always ends. */
export type FogStart = number | "near" | "mid" | "midfar" | "far";

export interface StreamingConfig {
  /**
   * How geometry is managed. Textures adapt by distance either way.
   *
   *   "streamed"  chunks mount, re-tier and unload by distance.
   *   "resident"  every chunk is loaded once at `residentTier` and never
   *               unloaded, re-tiered or culled; only texture rungs change,
   *               and those swap in place so they never flash.
   *
   * Streaming geometry across a site whose whole near tier is a few dozen MB
   * buys nothing and costs every visible artefact — chunks arriving one at a
   * time, tier swaps mid-walk, eviction of geometry immediately re-requested.
   */
  geometryMode: "streamed" | "resident";
  /** The single LOD "resident" mounts. The three tiers are within ~5% of each
   *  other on triangles, so cheap tiers save download bytes, not frame time. */
  residentTier: Tier;
  /**
   * The SHARPEST geometry tier this device will mount, whatever the bands ask
   * for. `"near"` is no clamp.
   *
   * A ceiling on quality rather than on bytes, and it earns its place because
   * the last rung of the LOD ladder is priced very differently from the rest.
   * Measured on this bake, over the phone's 25/100 m bands:
   *
   *     near band -> far tier   12.0 MB wire   192 MB   3.1 cm grid
   *     near band -> mid tier   12.1 MB wire   190 MB   1.6 cm grid
   *     near band -> near tier  15.7 MB wire   198 MB   0.4 cm grid
   *
   * Going from `far` to `mid` halves the position error for a tenth of a
   * megabyte — it is nearly free, because `mid` is where the decimation has
   * already happened and only the quantisation differs. Going on to `near`
   * costs another 3.6 MB for a step from 1.6 cm to 0.4 cm, which is below what
   * a phone screen resolves at walking distance.
   *
   * The BANDS still do their job underneath: this only clamps how sharp the
   * near band may resolve, and `nearDist` continues to select the 512 px
   * texture rung regardless of what the geometry does.
   */
  sharpestTier: Tier;
  /**
   * Free the JS-heap copy of a chunk's vertex data once the GPU has it
   * ("resident" only). Default false.
   *
   * Three keeps the decoded arrays after upload, so a mounted chunk is charged
   * to the JS heap AND to video memory — ~254 MB twice over on this bake, which
   * costs a phone its WebGL context. This is what makes residency affordable.
   *
   * Freeing nulls `geometry.attributes.position`, which `bvh-raycast.ts` builds
   * its tree from — so it is SCOPED: chunks matched by `StreamConfig.pick` keep
   * their arrays and stay pickable. On this bake that is 3 of 345 chunks.
   *
   * `resident` only: `streamed` re-uploads from `cpuCache` on re-mount, and a
   * freed array cannot be re-uploaded. A lost context then needs a reload.
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
  /**
   * Ceiling on bytes fetched from the network for the whole session, MB.
   * 0 disables it, which is every desktop config.
   *
   * The only budget here that counts the WIRE rather than memory. Memory is
   * bounded by `residentBudgetMB` and dominated by geometry; the wire is
   * dominated by texture rungs, which accumulate as a session walks the site.
   *
   * Enforced in `ChunkManager.rungFor()`, so it throttles discretionary spend
   * only: geometry is never refused and no chunk is left untextured. It stops
   * rung UPGRADES, which `updateTextures()` orders nearest-first — so the
   * budget runs out on the horizon rather than in front of the camera.
   */
  wireBudgetMB: number;
  frustumCull: boolean;
  frustumMargin: number;
  alwaysLoadDist: number;
  cullGraceTicks: number;
  /** Where three's transmission pass may run — see `StreamConfig.render`. One
   *  visible transmissive material re-renders the whole opaque scene per frame. */
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
   *  `ChunkManager` — it travels here because it is per-view like the bands. */
  maxDpr: number;
  /** Mount every chunk at this tier regardless of its distance band. The bands
   *  still decide what loads and what unloads — see `StreamConfig.forceTier`. */
  forceTier?: Tier;
  /** Chunks these rules match are never loaded in this view. Resolved to chunk
   *  ids by `ChunkManager`, the only place the manifest and `materials.json`
   *  are both in hand. Empty outside the dollhouse. */
  hide: StreamHideRule[];
  /** Chunks that keep their CPU arrays — and so stay raycastable — when
   *  `freeCpuArrays` is on. See `StreamConfig.pick`. */
  pick: StreamHideRule[];
  /** Distance fog — why the download radius can be small: geometry fades into
   *  the backdrop before the unload boundary instead of vanishing at it.
   *  `color` is normally unset, so StreamFog tracks the live `scene.background`
   *  and cannot disagree with it mid-crossfade. Set it to pin a hex. */
  fog: { enabled: boolean; start: FogStart; color?: string };
}

// Where the baked chunk set is served from. Two env vars, because a published
// prefix does not have to be spelled like the local one:
//   NEXT_PUBLIC_STREAM_BASE   the complete base, used verbatim.
//   NEXT_PUBLIC_ASSET_BASE    a root that `<slug>/assets/` is appended to,
//                             default `/assets` (the gitignored public/ copy).
// The complete form wins when both are set, because a bake's slug and its
// published path genuinely diverge. Either source must allow cross-origin GET.
// One variable per bake, read as separate literal expressions: Next inlines
// `process.env.NEXT_PUBLIC_*` by static text match, so a computed key silently
// yields undefined in the browser.
const STREAM_BASE_V1 = process.env.NEXT_PUBLIC_STREAM_BASE;
const STREAM_BASE_V2 = process.env.NEXT_PUBLIC_STREAM_BASE_V2;
const STREAM_BASE_V3 = process.env.NEXT_PUBLIC_STREAM_BASE_V3;
const ASSET_ROOT = (process.env.NEXT_PUBLIC_ASSET_BASE ?? "/assets").replace(/\/+$/, "");

const withSlash = (u: string) => `${u.trim().replace(/\/+$/, "")}/`;

/**
 * Where one bake is served from, ending in a slash. Three sources, most
 * specific first:
 *
 *   NEXT_PUBLIC_STREAM_BASE[_V2|_V3]  one variable per bake, the source of
 *                                truth. None falls back to another model's —
 *                                an unset one drops to the local staging path
 *                                and 404s loudly rather than serving the wrong
 *                                bake under this route's name.
 *   `stream.assetBase`           a per-block URL in the site file. Supported
 *                                but deliberately unauthored here.
 *   NEXT_PUBLIC_ASSET_BASE       a root that `<slug>/assets/` is appended to,
 *                                default `/assets` — the local staging copy.
 *
 * Whichever wins must allow cross-origin GET.
 */
function assetBaseFor(id: StreamVariantId, block: { slug: string; assetBase?: string }): string {
  const fromEnv = id === "v3" ? STREAM_BASE_V3 : id === "v2" ? STREAM_BASE_V2 : STREAM_BASE_V1;
  if (fromEnv) return withSlash(fromEnv);
  if (block.assetBase) return withSlash(block.assetBase);
  return `${ASSET_ROOT}/${block.slug}/assets/`;
}

/** The site file's vocabulary → the shape ChunkManager consumes. */
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

    // All three tiers are textured, resolution stepping down with distance.
    // Set to [] to render everything flat — useful for isolating a texture bug.
    texturedTiers: ["near", "mid", "far"],
    texRung: { near: m.tiers.near.texture.px, mid: m.tiers.mid.texture.px, far: m.tiers.far.texture.px },
    texFormat: { near: m.tiers.near.texture.format, mid: m.tiers.mid.texture.format, far: m.tiers.far.texture.format },
    // Textures persist for the whole loaded range, so nothing inside the bubble
    // renders flat. Equal to unloadDist by construction.
    textureDist: unload,

    maxLoadsPerTick: s.loadsPerTick,
    updateHz: s.updateHz,

    cacheLimit: m.cache.limitChunks,
    residentBudgetMB: m.cache.residentBudgetMB,
    // Unlimited unless a constrained profile sets one; see `residencyClamp`.
    wireBudgetMB: 0,

    geometryMode: s.geometry ?? "streamed",
    // No clamp unless a constrained profile applies one; see `residencyClamp`.
    sharpestTier: "near" as Tier,
    residentTier: s.residentTier ?? "near",
    // Defaults off, unlike upstream — see the field doc. A bake that asks for
    // it explicitly still gets it; nothing turns it on by omission.
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
    pick: m.pick ?? [],
  };
}

/** Which bake a route streams — the same id the route picks its site with, so
 *  a bake and the document describing it are one choice. No merging between. */
export type StreamVariantId = SiteId;

/**
 * One bake, fully resolved: where it is served from, and the three strategies
 * over its manifest. Everything is per-model, and the route chooses.
 */
export interface StreamVariant {
  id: StreamVariantId;
  /** Ends in a slash. Everything the streamer fetches hangs off it. */
  assetBase: string;
  /** The navmesh travels with the chunks, so it follows the variant too. */
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

/** Every bake, resolved once, each straight out of its own site file. */
export const STREAM_VARIANTS: Record<StreamVariantId, StreamVariant> = {
  v1: buildVariant("v1", SITES.v1.scene.stream),
  v2: buildVariant("v2", SITES.v2.scene.stream),
  v3: buildVariant("v3", SITES.v3.scene.stream),
};

export function streamVariant(id: StreamVariantId): StreamVariant {
  return STREAM_VARIANTS[id];
}

// MOBILE PROFILE — a proportional shrink derived from the authored numbers, so
// it tracks any retune. Phones enforce a VRAM ceiling of a few hundred MB
// before killing the WebGL context.
const MOBILE = {
  /**
   * A phone gives up QUALITY, not distance, so `far` is left alone (farScale 1)
   * and `mid` pulls in hard instead, resolving most of the frame to the `far`
   * rung. Measured: the three tiers land within 20% of each other in decoded
   * memory, so LOD does not buy VRAM, and the frustum cull already keeps the
   * full 900 m radius under the mobile ceiling. A shrunken radius reads as the
   * world ending, and fog cannot hide it in tens of metres.
   *
   * `near` does come in, because under residency it no longer selects geometry
   * at all — `rungBand()` is its only live consumer, and what it selects is the
   * 512 TEXTURE rung. Halving it is how a phone limits that spend at the source
   * rather than truncating the ladder mid-walk. Check `tierFor`, the
   * `effUnload` floor, the eviction guard and the pre-mount cap before changing
   * it; all read `nearDist` on the streamed path.
   */
  nearScale: 0.5,
  midScale: 0.4,
  farScale: 1,
  /**
   * Per-tier ceilings, not a scale, and `near` is not stepped down: with KTX2
   * the full 512 rung (12.3 MB VRAM over this bake's 72 images) is cheaper than
   * the 256 rung as WebP (17.3 MB), at twice the linear resolution.
   *
   * `mid`/`far` stay at the bottom of the ladder, where the whole image set
   * costs 1.3 MB. Applied with `Math.min`, so a bake authoring a smaller rung
   * keeps it and this can never ask for a rung the bake lacks.
   */
  rung: { near: 512, mid: 256, far: 128 } as Record<Tier, number>,
  /** Superseded and unused: `ChunkManager.rungBand()` picks the rung from
   *  distance under residency, so `MOBILE.rung` is the real answer. Flattening
   *  every chunk to one rung applied the cheap rung at arm's length. */
  residentRung: 256,
  /** One per tick (10/s) took 20-43 s to fill the 200-430 chunks inside the
   *  full 900 m radius. Four is ~5 s at the median, ~11 s at the p90; the
   *  decode is off the render thread and `flushReveals()` batches the uploads. */
  loadsPerTick: 4,
  /** A phone cannot pay for a second full scene render, and the stand-in alpha
   *  is indistinguishable on these materials. Forced, not scaled. */
  transmission: "off" as const,
  /** Half the upgrade wave: a small screen hides the preview rung for longer,
   *  and the network is the scarcer resource here. */
  texUpgradesScale: 0.5,
  /** DPR ceiling — only where `AdaptiveQuality` starts; it still steps down
   *  under load, which is the right place for that decision. Matches what the
   *  aerial and dollhouse configs already run at, so the ground view is not
   *  softer than the overview it was entered from. */
  maxDpr: 1.5,
  /**
   * The tier a phone holds the whole model at under `geometryMode: "resident"`.
   * A close call worth re-measuring on the next bake.
   *
   * Only the near tier of this bake was re-encoded with meshopt +
   * KHR_mesh_quantization, so PER TRIANGLE it is the cheaper one (27.3 vs
   * 33.3 B/tri). In TOTAL far wins, carrying a third fewer triangles:
   * ~212 MB / 6.37 M tris against ~254 MB / 9.38 M. Both halves matter on a
   * phone — megabytes for whether the context survives, triangles for the frame
   * rate that decides where `AdaptiveQuality` parks the DPR.
   *
   * If the meshopt stage is ever run across all three tiers, near becomes
   * competitive in total too and this should go back to "near".
   */
  residentTier: "far" as Tier,
  /**
   * Hard ceiling on decoded resident bytes, MB. Enforced by `updateResident()`,
   * which mounts nearest-first and stops at the ceiling — so what is given up
   * is the far edge of the world, never what you are standing next to.
   *
   * 240 is measured, not picked: the far tier decodes to ~212 MB, plus ~12 MB
   * of KTX2 textures and ~1 MB of kept ground arrays, and the reference runtime
   * holds ~259 MB of the same model on the same phone without losing context.
   */
  residentBudgetMB: 240,
  /** The sharpest tier a phone mounts — see `StreamingConfig.sharpestTier` for
   *  the three-way measurement this comes from. `mid` is where the curve bends:
   *  it buys half the position error of `far` for a tenth of a megabyte, and
   *  `near` costs 3.6 MB more for a step the screen cannot resolve. */
  sharpestTier: "mid" as Tier,
  /**
   * The session download budget, MB. Against this bake:
   *
   *     geometry, far tier, all 345 chunks   12.0 MB   mandatory
   *     the 128 rung across all 72 images     0.6 MB   effectively mandatory
   *     -------------------------------------------
   *     left for 256/512 upgrades             2.4 MB
   *
   * The ladder cannot be walked to completion inside it, which is the point:
   * upgrades are issued nearest-first, so what fits is spent in front of the
   * camera and the rest of the world holds at the rung it has.
   */
  wireBudgetMB: 15,
};

function mobileProfile(c: StreamingConfig): StreamingConfig {
  const nearDist = Math.round(c.nearDist * MOBILE.nearScale);
  const midDist = Math.round(c.midDist * MOBILE.midScale);
  const farDist = Math.round(c.farDist * MOBILE.farScale);
  const unloadDist = Math.round(farDist * (c.unloadDist / c.farDist));
  // A CEILING per tier, never a set: a bake authoring a smaller rung keeps it.
  const rung = (t: Tier, px: number) => Math.min(px, MOBILE.rung[t]);
  return {
    ...c,
    nearDist,
    midDist,
    farDist,
    unloadDist,
    textureDist: unloadDist,
    texRung: {
      near: rung("near", c.texRung.near),
      mid: rung("mid", c.texRung.mid),
      far: rung("far", c.texRung.far),
    },
    maxLoadsPerTick: MOBILE.loadsPerTick,
    transmission: MOBILE.transmission,
    texUpgradesPerTick: Math.max(1, Math.round(c.texUpgradesPerTick * MOBILE.texUpgradesScale)),
    maxDpr: Math.min(c.maxDpr, MOBILE.maxDpr),
    // No fog override: `far` has not moved, so the fade keeps the full depth it
    // was tuned with. The cache can be smaller, but it must still exceed the
    // peak mounted count or the LRU does nothing.
    cacheLimit: Math.max(64, Math.round(c.cacheLimit * 0.4)),
    // Geometry mode is NOT overridden: a phone runs whatever the bake authors.
    // Forcing "streamed" here re-arms the bands, the frustum gate, the unload
    // pass and the `effUnload` governor — every mechanism that can make
    // geometry vanish — on the device where that is most visible. It produced
    // exactly the artefacts residency exists to prevent: `effUnload` collapsing
    // 990 m → 75 m on the view swap while eviction pulled 32 chunks a tick, and
    // geometry blinking out and back as the camera was dragged.
    //
    // The cost is a fixed resident set held for the session. If a phone loses
    // its context, the follow-ups are `freeCpuArrays` (see the field doc) and
    // publishing the KTX2 texture set — the v8w set is WebP only, which decodes
    // at ~5.33 B/texel against KTX2's ~1.
    //
    // residentTier / freeCpuArrays / residentBudgetMB come from
    // `residencyClamp`, which applies them to all three views.
  };
}

// LOW PROFILE — the machine that is neither a phone nor a workstation, and
// which passed `isLowPower()` and `detectProfile()` as a desktop: a 1366x768
// laptop with eight cores, 8 GB of RAM and an Intel iGPU kept shadows, DPR 1.5,
// MSAA and the entire near tier. What "low" gives up is band, enough to fit the
// 192 MB a weak GPU is given; the texture rungs stay near desktop, because
// textures are 14 MB of the problem here and geometry is 200.
const LOW = {
  /** Distance is not what this profile gives up — see MOBILE.nearScale. The
   *  full 900 m measures 82 MB median / 114 MB p90 against a 192 MB budget. */
  farScale: 1,
  /** Quality is. Mid pulls in so most of the frame resolves to the `far` rung —
   *  same memory, ~5x less download. Less aggressive than mobile's 0.4, since a
   *  full-size screen shows the drop sooner. */
  midScale: 0.6,
  /** One rung down on `near` only — mid and far are already at 256/128, and
   *  the whole resident texture set is 21.7 MB at desktop rungs, 12 MB here. */
  rungScale: 0.75,
  /** Half the desktop wave. A weak GPU is usually behind a weak decoder, and
   *  the chunk decode is what competes with the frame. */
  loadsScale: 0.5,
  /** One visible transmissive material re-renders the whole opaque scene every
   *  frame — the biggest frame-time item here, and the least missed. */
  transmission: "off" as const,
  /** DPR 1.0. On a 1366x768 panel, with MSAA also off (see CanvasWithWrapper),
   *  that is ~85 MB of video memory down to ~8 MB — none of it visible to
   *  `residentBytes()`, so it has to be given up here. */
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
    // No fog override and no geometry-mode override, both for the reasons in
    // mobileProfile: forcing streamed bought this machine the same pop-in and
    // drag-flicker it bought a phone. Residency fields come from
    // `residencyClamp`.
  };
}

/**
 * Which profile this machine gets. Runs only in the browser; returns "desktop"
 * during SSR so hydration is stable.
 *
 * Most-constrained first, and the two tests answer different questions:
 * "mobile" is about DEVICE CLASS and its hard VRAM ceiling, "low" is about
 * CAPABILITY on a machine that presents as a desktop — hence the GPU string
 * rather than screen size.
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
  // one that matters; the other two catch a hidden renderer string or a machine
  // whose problem is the CPU rather than the card.
  const slowCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (weakGpuProbe() || slowCpu || lowMem) return "low";
  return "desktop";
}

/** The ground config on this device — what a person standing in the terminal
 *  streams with. The other two over the same manifest are
 *  `resolveAerialConfig` and `resolveDollhouseConfig`. */
export function resolveStreamConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig {
  const ground = STREAM_VARIANTS[variant].ground;
  const p = profile ?? detectProfile();
  // Both constrained profiles finish in `residencyClamp`, the one place the
  // residency fields are decided — they have to agree across all three configs,
  // which drive a single resident set.
  if (p === "mobile") return residencyClamp(mobileProfile(ground), p);
  if (p === "low") return residencyClamp(lowProfile(ground), p);
  return ground;
}

// AERIAL PROFILE — the second strategy over the same manifest.
// The ground bands assume the camera is IN the terminal; a layout camera is a
// framing shot 54-412 m up and up to 2.8 km out, where those bands resolved as
// few as 2 chunks of 831 and the shot framed empty sky.
// The fix is cheap because of the far tier: the entire model at `far` is
// 22.0 MB encoded plus 0.1 MB of 128 px images, so an unload radius spanning
// the whole district costs less than the ground config's own ceiling.
// A partial override of `stream`, so anything unnamed tracks the ground numbers.

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
 * The residency clamps, applied to every view a constrained device gets.
 *
 * `mobileProfile` and `lowProfile` reach the GROUND config only; the aerial and
 * dollhouse resolvers build from their own merged blocks. Residency is a
 * property of the SESSION, not the camera — all three views share one resident
 * set — so these fields have to be decided in one place or the odd one out
 * decides. Anything genuinely per-view stays in the individual resolvers.
 */
function residencyClamp(c: StreamingConfig, p: DeviceProfile): StreamingConfig {
  if (p === "desktop") {
    // DESKTOP GETS THE HEAP COPY BACK, and nothing else from this function.
    //
    // Three keeps a chunk's decoded arrays after upload, so a resident chunk is
    // charged to the JS heap AND to video memory — the same ~198 MB twice, for
    // a measured 440 MB total. Freeing the copy is 440 -> 243 MB and changes
    // nothing on screen.
    //
    // It was off here only because it used to be all-or-nothing and would have
    // broken picking. `pick` settled that: the ground keeps its arrays and stays
    // raycastable, which is what the route ribbon's probe and walk-to actually
    // resolve against. What desktop gives up is the same thing a phone already
    // gives up — a ray no longer hits a BUILDING, it passes through to the
    // ground behind it and walk-to snaps from there. Portals are untouched;
    // they match by name against the separate interior GLBs, not against chunks.
    return { ...c, freeCpuArrays: true };
  }
  const tier = MOBILE.residentTier;
  return {
    ...c,
    residentTier: tier,
    freeCpuArrays: true,
    residentBudgetMB: MOBILE.residentBudgetMB,
    // MOBILE ONLY: a "low" machine is a full-size screen at desk distance,
    // where the step from 1.6 cm to 0.4 cm is visible and it can afford the
    // 3.6 MB, so it keeps the whole ladder.
    sharpestTier: p === "mobile" ? MOBILE.sharpestTier : c.sharpestTier,
    // Mobile only: this budget is about the network, and "low" is a full-size
    // machine on a real connection whose problem is its GPU.
    wireBudgetMB: p === "mobile" ? MOBILE.wireBudgetMB : 0,
    // The rung ladder is deliberately left intact. `residentTier` pins the
    // GEOMETRY at `far` for its triangle count; the TEXTURE rung is chosen
    // per-chunk from distance by `ChunkManager.rungBand()`, so near/mid/far
    // still mean what they say. Collapsing them onto the resident tier here
    // handed the cheapest rung to whatever the camera stood in front of — the
    // "over-compressed" artefact, which was a config-flattening bug.
  };
}

export function resolveAerialConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  const aerial = STREAM_VARIANTS[variant].aerial;
  if (!aerial) return null;
  const p = profile ?? detectProfile();
  if (p === "desktop") return aerial;
  // "low" gets the throughput and resolution clamps and nothing else: pulling
  // an aerial band in re-creates the empty-sky shot the block exists to fix.
  if (p === "low") {
    return residencyClamp({
      ...aerial,
      maxLoadsPerTick: Math.max(1, Math.round(aerial.maxLoadsPerTick * LOW.loadsScale)),
      maxDpr: Math.min(aerial.maxDpr, LOW.maxDpr),
    }, p);
  }
  const rung = (t: Tier, px: number) => Math.min(px, MOBILE.rung[t]);
  return residencyClamp({
    ...aerial,
    texRung: {
      near: rung("near", aerial.texRung.near),
      mid: rung("mid", aerial.texRung.mid),
      far: rung("far", aerial.texRung.far),
    },
    maxLoadsPerTick: MOBILE.loadsPerTick,
  }, p);
}

// DOLLHOUSE PROFILE — the third strategy over the same manifest.
// One fixed vantage on the whole zone, where the frustum cull buys nothing and
// any `near` band spends bytes on detail nobody up here can see. So every chunk
// falls through to `far`: the whole model for ~22 MB encoded — the same bytes
// the walking view wants first, re-mounted from the decoded cache across the
// `setConfig` swap.
// Hide rules are resolved by ChunkManager, which has `materials.json` in hand.

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
    // Not overridable per view, unlike `hide`: both views share one resident
    // set, and freeing is irreversible, so this is a property of the bake.
    pick: raw.pick,
  });
}

/**
 * The config for the dollhouse overview, or null when `stream.dollhouse` is
 * absent. The mobile profile touches only the per-tick load budget: the rungs
 * are already at the bottom of the ladder and the distances are what make the
 * view whole, with no bytes to save — the entire far tier is ~22 MB.
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
    return residencyClamp({
      ...dollhouse,
      maxLoadsPerTick: Math.max(1, Math.round(dollhouse.maxLoadsPerTick * LOW.loadsScale)),
      maxDpr: Math.min(dollhouse.maxDpr, LOW.maxDpr),
    }, p);
  }
  return residencyClamp({ ...dollhouse, maxLoadsPerTick: MOBILE.loadsPerTick }, p);
}

/**
 * Where the fog fade starts and ends, in metres, or null when fog is off.
 *
 * `far` lands just inside the unload radius (×0.98), so geometry fades out
 * fully before eviction — otherwise a chunk on the line flickers as the camera
 * jitters across it.
 *
 * `near` is where the fade begins. A band name retunes itself when the bands
 * move; a number is that fraction of `far`. Start it too close and broad
 * surfaces wash out long before the boundary — at 0.35 the bridge deck vanished
 * into the haze while its thin cables survived, reading as missing geometry.
 */
export function fogRange(c: StreamingConfig): { near: number; far: number } | null {
  if (!c.fog.enabled) return null;
  const far = c.unloadDist * 0.98;
  const bands: Record<string, number> = {
    near: c.nearDist,
    mid: c.midDist,
    // Halfway between the mid and far edges: what you are meant to read stays
    // crisp, and the fade still has real depth to work in.
    midfar: (c.midDist + c.farDist) / 2,
    far: c.farDist,
  };
  const s = c.fog.start;
  const start = typeof s === "number" ? far * s : bands[s] ?? c.farDist;
  return { near: Math.max(1, Math.min(start, far - 1)), far };
}
