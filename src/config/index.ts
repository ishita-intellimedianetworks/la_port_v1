/**
 * The single entry point to the site configs. Nothing else in the app imports
 * a JSON directly, and nothing hardcodes a URL, a pose or a value.
 *
 * ONE FILE PER MODEL. `sites/v1.json`, `sites/v2.json` and `sites/v3.json` are
 * three COMPLETE, standalone documents — one per bake, one per route — with no
 * inheritance and no merge between them. There used to be a single `site.json`
 * with `stream` plus a `streamV2` partial layered over it at import, which
 * meant every route read the same cameras, hotspots, sky and world numbers and
 * a change for one bake was a change for all three. Now an edit can only ever
 * reach the route whose file it is in; the price is that a change meant for
 * every model has to be made three times, on purpose.
 *
 * Each document is shaped as DB TABLES so it can be lifted into a database
 * without a rewrite: `layouts` and `hotspots` are sibling arrays joined by
 * `hotspots[].layoutId`. This module is the ORM: it slices a document into the
 * views the app already reads (`scene`, `ui`), rebuilds the nesting the
 * Resources panel renders, and derives the id lookups.
 *
 *   <site>.json › meta/assets/stream/world/cameras/lights/globals/sky → `scene`
 *   <site>.json › zones/tones/copy                                    → `ui`
 *   <site>.json › layouts[]                                           → `layouts`
 *   <site>.json › hotspots[]                                          → `hotspots`
 *
 * A route names its site once, at the top of the tree, with `<SiteProvider id>`
 * (see `./context`); everything below reads `useSite()`. Resolution is per id
 * and happens once at import, so the three are ordinary values that can all be
 * held at the same time — the same reason `STREAM_VARIANTS` is a record rather
 * than a set of module constants derived from an env var.
 */

import v1Json from "./sites/v1.json";
import v2Json from "./sites/v2.json";
import v3Json from "./sites/v3.json";

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

/** Every model the app can serve, in route order: `/`, `/v2`, `/v3`. */
export const SITE_IDS = ["v1", "v2", "v3"] as const;
export type SiteId = (typeof SITE_IDS)[number];

/**
 * Where the map's images are served from.
 *
 * Same shape as NEXT_PUBLIC_STREAM_BASE: the COMPLETE base, used verbatim with
 * one filename appended. Unset falls back to `/floorplan`, the copies under
 * `public/`, so a checkout with no env still runs.
 *
 * `map.*.imageUrl` is therefore a BARE FILENAME. An absolute URL is still
 * honoured and skips the base entirely, for a site that pins one image to a
 * different host than the rest.
 */
const FLOORPLAN_BASE = (process.env.NEXT_PUBLIC_FLOORPLAN_BASE ?? "/floorplan").replace(/\/+$/, "");

function floorplanUrl(imageUrl: string): string {
  return /^(https?:)?\/\//.test(imageUrl) ? imageUrl : `${FLOORPLAN_BASE}/${imageUrl.replace(/^\/+/, "")}`;
}

/**
 * One model's config, fully resolved — the value `useSite()` hands out.
 *
 * `scene` and `ui` are VIEWS over the one document, kept because every reader
 * in the app already speaks them. Splitting the file per model did not need to
 * become a rename touching a hundred call sites.
 */
export interface Site {
  id: SiteId;
  /** The document this was resolved from, for the rare reader that wants a key
   *  no view exposes. */
  doc: SiteConfig;
  scene: SceneConfig;
  ui: UiConfig;
  hotspots: HotspotConfig[];
  /** The layouts table, each row given back its child-id list. */
  layouts: LayoutConfig[];
  layoutById: Record<string, LayoutConfig>;
  hotspotById: Record<string, HotspotConfig>;
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

  /**
   * The layouts table, each row given back the child-id list the UI reads.
   *
   * The list is REBUILT from `hotspots[].layoutId` in table order rather than
   * stored on the layout: parentage is one fact, and a file that states it
   * twice eventually states it two different ways. (The old config carried both
   * and needed a validator to keep them honest.)
   */
  const layouts: LayoutConfig[] = doc.layouts.map((row) => ({
    ...row,
    hotspots: hotspots.filter((h) => h.layoutId === row.id).map((h) => h.id),
  }));

  const layoutById: Record<string, LayoutConfig> = Object.fromEntries(layouts.map((l) => [l.id, l]));
  const hotspotById: Record<string, HotspotConfig> = Object.fromEntries(hotspots.map((h) => [h.id, h]));

  /**
   * True when a layout's camera is authored in the AIR rather than on the ground.
   *
   * `walkable: false` is that flag — L01 sits 60 units up over the main channel
   * and L10 sits 180 up over the whole terminal. There is deliberately no second
   * field for this: "the camera is off the navmesh" and "you cannot walk from
   * here" are the same fact, and two fields saying it would eventually disagree.
   *
   * Travel involving a fly camera is always a teleport, in BOTH directions:
   * there is no navmesh under an aerial camera to path from or to.
   */
  const isFlyLayout = (layoutId: string | null | undefined): boolean =>
    !!layoutId && layoutById[layoutId]?.walkable === false;

  const isFlyHotspot = (hotspotId: string): boolean => isFlyLayout(hotspotById[hotspotId]?.layoutId);

  /**
   * A layout's authored camera, resolved to a pose. No fallback — this is the
   * arithmetic on its own, so `startPose` below can use it without depending on
   * itself.
   */
  const authoredPose = (layout: LayoutConfig): CameraPose =>
    poseForCamera(layout.camera, layout.walkable === false ? 0 : doc.world.eyeHeight);

  /**
   * The layout the experience opens on — `<site>.json › startLayoutId`, a
   * foreign key into the layouts table.
   *
   * There is no separate `cameras.start` / `cameras.entry` block any more. A
   * start pose is not a fourth camera someone authors by hand; it is one of the
   * checkpoints already authored as a layout, named. The old `cameras.entry`
   * was literally L01's camera position copied into a second place, which is
   * exactly the drift this removes.
   */
  const startLayoutId = doc.startLayoutId;

  const startLayout = layoutById[startLayoutId];
  const startPose: CameraPose =
    !startLayout || isPlaceholder(startLayout.camera.position) ? ORIGIN_POSE : authoredPose(startLayout);

  const poseForLayout = (layoutId: string): CameraPose => {
    const layout = layoutById[layoutId];
    if (!layout || isPlaceholder(layout.camera.position)) return startPose;
    return authoredPose(layout);
  };

  /**
   * The viewpoint a hotspot is seen from — its OWN camera, framing just this
   * marker. Falls back to the parent layout's camera while a hotspot is still
   * unauthored, which is also what it did for every hotspot before they had
   * cameras of their own.
   *
   * The eye offset follows the PARENT layout: whether the runtime adds eye
   * height on arrival is a property of the ground under the pose, and a
   * hotspot's camera stands on the same ground its layout does.
   */
  const poseForHotspot = (hotspotId: string): CameraPose => {
    const hotspot = hotspotById[hotspotId];
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
    layouts,
    layoutById,
    hotspotById,
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
};

export function getSite(id: SiteId): Site {
  return SITES[id];
}

/**
 * True for a coordinate that has not been authored yet.
 *
 * Every position, rotation and camera in the `layouts` / `hotspots` tables sits
 * at `[0,0,0]` until it is authored against the real Everport model. Rather
 * than a flag someone has to remember to flip, the runtime just recognises the
 * origin: navigation falls back to the start pose and markers that would pile
 * up on the world origin are suppressed. Both behaviours disappear on their own
 * the moment real values land.
 */
export function isPlaceholder(v: Vec3): boolean {
  return v[0] === 0 && v[1] === 0 && v[2] === 0;
}

/**
 * Turn a position + target into the YXZ euler the camera applies.
 *
 * Three.js cameras look down -Z, so forward is
 * `(-cos(pitch)sin(yaw), sin(pitch), -cos(pitch)cos(yaw))`; inverting that
 * gives `yaw = atan2(-dx, -dz)`. Dropping those minus signs aims the camera
 * exactly 180° away from its subject.
 */
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

/**
 * Reorder an XYZ euler to the YXZ one a camera is set with.
 *
 * Everything authored against the model — `hotspots[].rotation`,
 * `layouts[].camera.rotation` — is stored in the order `/extract-pos` prints,
 * which is XYZ; every camera in the app is applied as
 * `camera.rotation.set(x, y, z, "YXZ")`. The two orders name DIFFERENT
 * orientations for the same triple as soon as more than one axis is non-zero,
 * so the reorder is not cosmetic: read L04's `[3.1416, 0.4974, -3.1416]` as YXZ
 * and the camera ends up upside down looking the wrong way.
 *
 * Done as arithmetic rather than by borrowing three.js's `Euler`, so the config
 * module stays dependency-free and importable from anywhere. Composes the XYZ
 * rotation matrix `Rx·Ry·Rz` and reads the YXZ angles back off it.
 */
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

/**
 * Resolve a `LayoutCamera` — authored either way — to the pose the runtime
 * applies.
 *
 * An authored `rotation` IS the pose, straight off the `cp_NNN` node, so the
 * only thing done to it is the XYZ → YXZ reorder above. `eyeOffset` applies
 * solely to the `target` form, where a ground camera is authored at floor level
 * and the runtime adds eye height when it seats it — so the pitch has to be
 * measured from the eye, not the feet. An aerial camera is already at its final
 * height, which is why every layout here passes 0.
 */
export function poseForCamera(camera: LayoutCamera, eyeOffset = 0): CameraPose {
  if (camera.rotation) return { position: camera.position, rotation: xyzToYxz(camera.rotation) };
  if (camera.target) return poseLookingAt(camera.position, camera.target, eyeOffset);
  return { position: camera.position, rotation: [0, 0, 0] };
}

// Load-time validation (dev only)
// The checks a database would enforce with constraints, run here for as long as
// the tables live in files: primary-key format, primary-key uniqueness,
// foreign-key integrity, and the demo's one cross-row invariant. Run per site,
// because the three no longer share a row.

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
