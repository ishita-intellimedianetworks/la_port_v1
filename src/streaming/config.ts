import { SITES, type SiteId } from "@/config";
import { weakGpuProbe } from "./memory";
import { vrStreamConfig, vrStreamingOn } from "@/vr/engine/stream";
import type { StreamConfig, StreamHideRule } from "@/config/schema";

export type Tier = "near" | "mid" | "far";

export type DeviceProfile = "mobile" | "low" | "desktop";

export const TIER_ORDER: Tier[] = ["near", "mid", "far"];

export type TexFormat = "auto" | "webp" | "ktx2";

export type FogStart = number | "near" | "mid" | "midfar" | "far";

export interface StreamingConfig {
  geometryMode: "streamed" | "resident";
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
  transmission: "off" | "near" | "all";
  progressiveTex: boolean;
  texUpgradesPerTick: number;
  adaptiveDpr: boolean;
  maxDpr: number;
  forceTier?: Tier;
  hide: StreamHideRule[];
  pick: StreamHideRule[];
  fog: { enabled: boolean; start: FogStart; color?: string };
  mobileFarScale?: number;
  coarsenResident?: boolean;
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

    texturedTiers: ["near", "mid", "far"],
    texRung: { near: m.tiers.near.texture.px, mid: m.tiers.mid.texture.px, far: m.tiers.far.texture.px },
    texFormat: { near: m.tiers.near.texture.format, mid: m.tiers.mid.texture.format, far: m.tiers.far.texture.format },
    textureDist: unload,

    maxLoadsPerTick: s.loadsPerTick,
    updateHz: s.updateHz,

    cacheLimit: m.cache.limitChunks,
    residentBudgetMB: m.cache.residentBudgetMB,
    wireBudgetMB: 0,

    geometryMode: s.geometry ?? "streamed",
    sharpestTier: "near" as Tier,
    residentTier: s.residentTier ?? "near",
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

export type StreamVariantId = SiteId;

export interface StreamVariant {
  id: StreamVariantId;
  assetBase: string;
  navmeshUrl: string;
  ground: StreamingConfig;
  aerial: StreamingConfig | null;
  dollhouse: StreamingConfig | null;
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
  transmission: "off" as const,
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
    cacheLimit: Math.max(64, Math.round(c.cacheLimit * 0.4)),
  };
}

const LOW = {
  farScale: 1,
  midScale: 0.6,
  rungScale: 0.75,
  loadsScale: 0.5,
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
  return vrStreamingOn() ? "mobile" : detectDevice();
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

export function resolveStreamConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig {
  return vrStreamConfig(resolveGroundConfig(variant, profile), "walk");
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
    wireBudgetMB: p === "mobile" ? MOBILE.wireBudgetMB : 0,
  };
}

export function resolveAerialConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  return vrStreamConfig(resolveAerialBase(variant, profile), "walk");
}

function resolveAerialBase(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  const aerial = STREAM_VARIANTS[variant].aerial;
  if (!aerial) return null;
  const p = profile ?? detectProfile();
  if (p === "desktop") return aerial;
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
    pick: raw.pick,
  });
}

export function resolveDollhouseConfig(
  variant: StreamVariantId,
  profile?: DeviceProfile,
): StreamingConfig | null {
  return vrStreamConfig(resolveDollhouseBase(variant, profile), "dollhouse");
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
    midfar: (c.midDist + c.farDist) / 2,
    far: c.farDist,
  };
  const s = c.fog.start;
  const start = typeof s === "number" ? far * s : bands[s] ?? c.farDist;
  return { near: Math.max(1, Math.min(start, far - 1)), far };
}
