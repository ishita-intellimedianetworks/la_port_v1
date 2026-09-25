import { SITES, type SiteId } from "@/config";
import { weakGpuProbe } from "./memory";
import type { StreamConfig, StreamHideRule } from "@/config/schema";

export type Tier = "near" | "mid" | "far";

export type DeviceProfile = "mobile" | "low" | "desktop";

/** Fallback order when a chunk lacks a requested tier (small chunks are baked
 *  near-only). Declared above the resolved config, which reads it at init. */
export const TIER_ORDER: Tier[] = ["near", "mid", "far"];

export type TexFormat = "auto" | "webp" | "ktx2";

/** Where the fog fade begins. A band name retunes itself when the bands move;
 *  a number is that fraction of the unload radius, where the fade always ends. */
export type FogStart = number | "near" | "mid" | "midfar" | "far";

export interface StreamingConfig {
  geometryMode: "streamed" | "resident";
  /** The single LOD "resident" mounts. The three tiers are within ~5% of each
   *  other on triangles, so cheap tiers save download bytes, not frame time. */
  residentTier: Tier;
  sharpestTier: Tier;
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
  hide: StreamHideRule[];
  /** Chunks that keep their CPU arrays — and so stay raycastable — when
   *  `freeCpuArrays` is on. See `StreamConfig.pick`. */
  pick: StreamHideRule[];
  fog: { enabled: boolean; start: FogStart; color?: string };
  /** Replaces `MOBILE.farScale` for this model. The phone profile pulls the far
   *  band in hard, and with it `unloadDist` and the fog far plane; a model whose
   *  subject is further out than that horizon needs its own number. */
  mobileFarScale?: number;
}

const STREAM_BASE_V1 = process.env.NEXT_PUBLIC_STREAM_BASE;
const STREAM_BASE_V2 = process.env.NEXT_PUBLIC_STREAM_BASE_V2;
const STREAM_BASE_V3 = process.env.NEXT_PUBLIC_STREAM_BASE_V3;
const STREAM_BASE_V4 = process.env.NEXT_PUBLIC_STREAM_BASE_V4;
const STREAM_BASE_V5 = process.env.NEXT_PUBLIC_STREAM_BASE_V5;
const ASSET_ROOT = (process.env.NEXT_PUBLIC_ASSET_BASE ?? "/assets").replace(/\/+$/, "");

const withSlash = (u: string) => `${u.trim().replace(/\/+$/, "")}/`;

function assetBaseFor(id: StreamVariantId, block: { slug: string; assetBase?: string }): string {
  const fromEnv =
    id === "v5"
      ? (STREAM_BASE_V5 ?? STREAM_BASE_V4)
      : id === "v4"
      ? STREAM_BASE_V4
      : id === "v3"
        ? STREAM_BASE_V3
        : id === "v2"
          ? STREAM_BASE_V2
          : STREAM_BASE_V1;
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
    mobileFarScale: m.mobileFarScale,
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
  v4: buildVariant("v4", SITES.v4.scene.stream),
  v5: buildVariant("v5", SITES.v5.scene.stream),
};

export function streamVariant(id: StreamVariantId): StreamVariant {
  return STREAM_VARIANTS[id];
}

const MOBILE = {
  farScale: 0.55,
  nearScale: 0.5,
  midScale: 0.4,
  rung: { near: 512, mid: 256, far: 128 } as Record<Tier, number>,
  residentRung: 256,
  loadsPerTick: 4,
  /** A phone cannot pay for a second full scene render, and the stand-in alpha
   *  is indistinguishable on these materials. Forced, not scaled. */
  transmission: "off" as const,
  /** Half the upgrade wave: a small screen hides the preview rung for longer,
   *  and the network is the scarcer resource here. */
  texUpgradesScale: 0.5,
  maxDpr: 1.5,
  residentTier: "far" as Tier,
  residentBudgetMB: 240,
  sharpestTier: "mid" as Tier,
  wireBudgetMB: 15,
};

function mobileProfile(c: StreamingConfig): StreamingConfig {
  const nearDist = Math.round(c.nearDist * MOBILE.nearScale);
  const midDist = Math.round(c.midDist * MOBILE.midScale);
  const farDist = Math.round(c.farDist * (c.mobileFarScale ?? MOBILE.farScale));
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
    fog: { ...c.fog, start: 0.7 },
    // The cache can be smaller, but must still exceed the peak mounted count or
    // the LRU does nothing.
    cacheLimit: Math.max(64, Math.round(c.cacheLimit * 0.4)),
  };
}

const LOW = {
  /** Distance is not what this profile gives up — see MOBILE.nearScale. The
   *  full 900 m measures 82 MB median / 114 MB p90 against a 192 MB budget. */
  farScale: 1,
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
  };
}

export function detectProfile(): DeviceProfile {
  return vrStreaming ? "mobile" : detectDevice();
}

function detectDevice(): DeviceProfile {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "desktop";
  const uaMobile = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (uaMobile === true) return "mobile";
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)) return "mobile";
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof mem === "number" && mem <= 4;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const smallish = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 820;
  if (coarse && (smallish || lowMem)) return "mobile";
  const slowCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (weakGpuProbe() || slowCpu || lowMem) return "low";
  return "desktop";
}

let _constrained: boolean | null = null;

export function isConstrainedDevice(): boolean {
  if (_constrained === null) _constrained = detectDevice() !== "desktop";
  return _constrained;
}

let _mobile: boolean | null = null;

export function isMobileDevice(): boolean {
  if (_mobile === null) _mobile = detectDevice() === "mobile";
  return _mobile;
}

let vrStreaming = false;

export function setVrStreaming(on: boolean) {
  vrStreaming = on;
}

function vrClamp<C extends StreamingConfig | null>(c: C): C {
  if (!vrStreaming || !c) return c;
  return { ...c, transmission: "off", adaptiveDpr: false };
}

export function resolveStreamConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig {
  return vrClamp(resolveGroundConfig(variant, profile));
}

function resolveGroundConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig {
  const ground = STREAM_VARIANTS[variant].ground;
  const p = profile ?? detectProfile();
  if (p === "mobile") return residencyClamp(mobileProfile(ground), p);
  if (p === "low") return residencyClamp(lowProfile(ground), p);
  return ground;
}

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

function residencyClamp(c: StreamingConfig, p: DeviceProfile): StreamingConfig {
  if (p === "desktop") {
    return { ...c, freeCpuArrays: true };
  }
  const tier = MOBILE.residentTier;
  return {
    ...c,
    residentTier: tier,
    freeCpuArrays: true,
    residentBudgetMB: MOBILE.residentBudgetMB,
    sharpestTier: p === "mobile" ? MOBILE.sharpestTier : c.sharpestTier,
    // Mobile only: this budget is about the network, and "low" is a full-size
    // machine on a real connection whose problem is its GPU.
    wireBudgetMB: p === "mobile" ? MOBILE.wireBudgetMB : 0,
  };
}

export function resolveAerialConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  return vrClamp(resolveAerialBase(variant, profile));
}

function resolveAerialBase(
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

export function resolveDollhouseConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  return vrClamp(resolveDollhouseBase(variant, profile));
}

function resolveDollhouseBase(
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
  return residencyClamp(
    { ...dollhouse, maxLoadsPerTick: MOBILE.loadsPerTick, fog: { ...dollhouse.fog, enabled: true } },
    p,
  );
}

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
