import v1Json from "./sites/v1.json";
import v2Json from "./sites/v2.json";
import v3Json from "./sites/v3.json";
import v4Json from "./sites/v4.json";

import type {
  CameraPose,
  HotspotConfig,
  LayoutCamera,
  LayoutConfig,
  SceneConfig,
  SiteConfig,
  Tone,
  UiConfig,
  Vec3,
} from "./schema";

/** Every model the app can serve, in route order: `/`, `/v2`, `/v3`, `/v4`. */
export const SITE_IDS = ["v1", "v2", "v3", "v4"] as const;
export type SiteId = (typeof SITE_IDS)[number];

const FLOORPLAN_BASE = (process.env.NEXT_PUBLIC_FLOORPLAN_BASE ?? "/floorplan").replace(/\/+$/, "");

function floorplanUrl(imageUrl: string): string {
  return /^(https?:)?\/\//.test(imageUrl) ? imageUrl : `${FLOORPLAN_BASE}/${imageUrl.replace(/^\/+/, "")}`;
}

export interface Site {
  id: SiteId;
  /** The document this was resolved from, for the rare reader that wants a key
   *  no view exposes. */
  doc: SiteConfig;
  scene: SceneConfig;
  ui: UiConfig;
  hotspots: HotspotConfig[];
  securityHotspots: HotspotConfig[];
  /** The layouts table, each row given back its child-id list. */
  layouts: LayoutConfig[];
  layoutById: Record<string, LayoutConfig>;
  hotspotById: Record<string, HotspotConfig>;
  /** Security rows by id, for the same reason `hotspotById` exists. */
  securityHotspotById: Record<string, HotspotConfig>;
  startLayoutId: string;
  /** Where the experience begins. Every "default pose" — the Canvas camera, the
   *  first-person start, the fallback for an unauthored layout — reads THIS. */
  startPose: CameraPose;
  poseForLayout: (layoutId: string) => CameraPose;
  poseForHotspot: (hotspotId: string) => CameraPose;
  /** True when a layout's camera is authored in the AIR rather than on the
   *  ground — see `resolveSite`. */
  isFlyLayout: (layoutId: string | null | undefined) => boolean;
  /** A resource has no camera of its own — it is viewed from its layout's. */
  isFlyHotspot: (hotspotId: string) => boolean;
  /** Explicit `tone` wins; otherwise the enum value is matched against
   *  `<site>.json › tones`. */
  toneFor: (value: string | number | boolean, explicit?: Tone) => Tone | undefined;
}

const ORIGIN_POSE: CameraPose = { position: [0, 0, 0], rotation: [0, 0, 0] };

function resolveSite(id: SiteId, doc: SiteConfig): Site {
  /** `map` with its image URLs resolved, so no reader has to know about the base. */
  const map: SceneConfig["map"] = doc.map && {
    ...doc.map,
    ...(doc.map.plan && { plan: { ...doc.map.plan, imageUrl: floorplanUrl(doc.map.plan.imageUrl) } }),
    ...(doc.map.base && { base: { ...doc.map.base, imageUrl: floorplanUrl(doc.map.base.imageUrl) } }),
  };

  const scene: SceneConfig = {
    meta: doc.meta,
    assets: doc.assets,
    stream: doc.stream,
    world: doc.world,
    cameras: doc.cameras,
    lights: doc.lights,
    globals: doc.globals,
    map,
    sky: doc.sky,
  };

  const ui: UiConfig = {
    zones: doc.zones,
    tones: doc.tones,
    ...doc.copy,
  };

  const hotspots: HotspotConfig[] = doc.hotspots;
  const securityHotspots: HotspotConfig[] = doc.securityHotspots ?? [];

  const layouts: LayoutConfig[] = doc.layouts.map((row) => ({
    ...row,
    hotspots: hotspots.filter((h) => h.layoutId === row.id).map((h) => h.id),
  }));

  const layoutById: Record<string, LayoutConfig> = Object.fromEntries(layouts.map((l) => [l.id, l]));
  const hotspotById: Record<string, HotspotConfig> = Object.fromEntries(hotspots.map((h) => [h.id, h]));
  const securityHotspotById: Record<string, HotspotConfig> = Object.fromEntries(
    securityHotspots.map((h) => [h.id, h]),
  );

  const isFlyLayout = (layoutId: string | null | undefined): boolean =>
    !!layoutId && layoutById[layoutId]?.walkable === false;

  const isFlyHotspot = (hotspotId: string): boolean => isFlyLayout(hotspotById[hotspotId]?.layoutId);

  const authoredPose = (layout: LayoutConfig): CameraPose =>
    poseForCamera(layout.camera, layout.walkable === false ? 0 : doc.world.eyeHeight);

  const startLayoutId = doc.startLayoutId;

  const startLayout = layoutById[startLayoutId];
  const startPose: CameraPose =
    !startLayout || isPlaceholder(startLayout.camera.position) ? ORIGIN_POSE : authoredPose(startLayout);

  const poseForLayout = (layoutId: string): CameraPose => {
    const layout = layoutById[layoutId];
    if (!layout || isPlaceholder(layout.camera.position)) return startPose;
    return authoredPose(layout);
  };

  const poseForHotspot = (hotspotId: string): CameraPose => {
    const hotspot = hotspotById[hotspotId] ?? securityHotspotById[hotspotId];
    if (!hotspot) return startPose;
    const camera = hotspot.camera;
    if (!camera || isPlaceholder(camera.position)) return poseForLayout(hotspot.layoutId);
    const eyeOffset = layoutById[hotspot.layoutId]?.walkable === false ? 0 : doc.world.eyeHeight;
    return poseForCamera(camera, eyeOffset);
  };

  const toneLookup: Record<string, Tone> = {};
  (Object.keys(ui.tones) as Tone[]).forEach((tone) => {
    ui.tones[tone].forEach((word) => {
      toneLookup[word.toUpperCase()] = tone;
    });
  });

  const toneFor = (value: string | number | boolean, explicit?: Tone): Tone | undefined => {
    if (explicit) return explicit;
    if (typeof value !== "string") return undefined;
    return toneLookup[value.toUpperCase()];
  };

  return {
    id,
    doc,
    scene,
    ui,
    hotspots,
    securityHotspots,
    layouts,
    layoutById,
    hotspotById,
    securityHotspotById,
    startLayoutId,
    startPose,
    poseForLayout,
    poseForHotspot,
    isFlyLayout,
    isFlyHotspot,
    toneFor,
  };
}

/** Every model, resolved once. The route picks one — see `./context`. */
export const SITES: Record<SiteId, Site> = {
  v1: resolveSite("v1", v1Json as unknown as SiteConfig),
  v2: resolveSite("v2", v2Json as unknown as SiteConfig),
  v3: resolveSite("v3", v3Json as unknown as SiteConfig),
  v4: resolveSite("v4", v4Json as unknown as SiteConfig),
};

export function getSite(id: SiteId): Site {
  return SITES[id];
}

export function isPlaceholder(v: Vec3): boolean {
  return v[0] === 0 && v[1] === 0 && v[2] === 0;
}

export function poseLookingAt(position: Vec3, target: Vec3, eyeOffset = 0): CameraPose {
  const dx = target[0] - position[0];
  const dy = target[1] - (position[1] + eyeOffset);
  const dz = target[2] - position[2];
  const flat = Math.hypot(dx, dz);
  return {
    position,
    rotation: [Math.atan2(dy, flat), Math.atan2(-dx, -dz), 0],
  };
}

function xyzToYxz([x, y, z]: Vec3): Vec3 {
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  const m11 = cy * cz, m13 = sy;
  const m21 = sx * sy * cz + cx * sz, m22 = -sx * sy * sz + cx * cz, m23 = -sx * cy;
  const m31 = -cx * sy * cz + sx * sz, m33 = cx * cy;
  const px = Math.asin(-Math.min(1, Math.max(-1, m23)));
  return Math.abs(m23) < 0.9999999
    ? [px, Math.atan2(m13, m33), Math.atan2(m21, m22)]
    : [px, Math.atan2(-m31, m11), 0];
}

export function poseForCamera(camera: LayoutCamera, eyeOffset = 0): CameraPose {
  if (camera.rotation) return { position: camera.position, rotation: xyzToYxz(camera.rotation) };
  if (camera.target) return poseLookingAt(camera.position, camera.target, eyeOffset);
  return { position: camera.position, rotation: [0, 0, 0] };
}

if (process.env.NODE_ENV !== "production") {
  const layoutIdRe = /^L(0[1-9]|10)$/;
  const hotspotIdRe = /^H(0[1-9]|[12]\d|30)$/;

  for (const id of SITE_IDS) {
    const s = SITES[id];
    const problems: string[] = [];

    if (!s.layoutById[s.startLayoutId]) {
      problems.push(`startLayoutId "${s.startLayoutId}" is not a layout`);
    }

    const seenLayout = new Set<string>();
    s.layouts.forEach((l) => {
      if (!layoutIdRe.test(l.id)) problems.push(`layout id "${l.id}" is not L01-L10`);
      if (seenLayout.has(l.id)) problems.push(`duplicate layout id "${l.id}"`);
      seenLayout.add(l.id);
    });

    const seenHotspot = new Set<string>();
    s.hotspots.forEach((h) => {
      if (!hotspotIdRe.test(h.id)) problems.push(`hotspot id "${h.id}" is not H01-H30`);
      if (seenHotspot.has(h.id)) problems.push(`duplicate hotspot id "${h.id}"`);
      seenHotspot.add(h.id);

      if (!s.layoutById[h.layoutId]) {
        problems.push(`hotspot ${h.id} references unknown layout "${h.layoutId}"`);
      }

      // The demo's one cross-row invariant: every mention of the hero container
      // is the same container, so the H09 → H14 → H24 → H30 story cannot fork.
      h.fields.forEach((f) => {
        if (f.ref === "hero" && f.value !== s.scene.globals.heroContainerId) {
          problems.push(
            `hotspot ${h.id} field ${f.name} is marked hero but reads "${f.value}" ` +
              `(expected "${s.scene.globals.heroContainerId}")`,
          );
        }
      });
    });

    if (problems.length) {
      console.error(`[port-config] ${id} validation failed:\n  ` + problems.join("\n  "));
    }
  }
}
