/**
 * The single entry point to `site.json` — the one config file. Nothing else in
 * the app imports the JSON directly, and nothing hardcodes a URL, a pose or a
 * value.
 *
 * `site.json` is shaped as DB TABLES so it can be lifted into a database
 * without a rewrite: `layouts` and `hotspots` are sibling arrays joined by
 * `hotspots[].layoutId`. This module is the ORM: it slices the document into
 * the views the app already reads (`scene`, `ui`), rebuilds the nesting the
 * Resources panel renders, and derives the id lookups.
 *
 *   site.json › meta/assets/world/cameras/lights/globals → `scene`  (the site record)
 *   site.json › theme/zones/tones/copy                   → `ui`     (presentation)
 *   site.json › layouts[]                                → `layouts`  (table)
 *   site.json › hotspots[]                               → `hotspots` (table)
 */

import siteJson from "./site.json";

import type {
  CameraPose,
  HotspotConfig,
  LayoutConfig,
  SceneConfig,
  SiteConfig,
  Tone,
  UiConfig,
  Vec3,
} from "./schema";

export const site = siteJson as unknown as SiteConfig;

/**
 * `scene` and `ui` are VIEWS over one document, kept because every reader in
 * the app already speaks them. Merging the files did not need to become a
 * rename touching a hundred call sites.
 */
export const scene: SceneConfig = {
  meta: site.meta,
  assets: site.assets,
  stream: site.stream,
  world: site.world,
  cameras: site.cameras,
  lights: site.lights,
  globals: site.globals,
  map: site.map,
};

export const ui: UiConfig = {
  zones: site.zones,
  tones: site.tones,
  ...site.copy,
};

// ── The two content tables ────────────────────────────────────────────────────

export const hotspots: HotspotConfig[] = site.hotspots;

/**
 * The layouts table, each row given back the child-id list the UI reads.
 *
 * The list is REBUILT from `hotspots[].layoutId` in table order rather than
 * stored on the layout: parentage is one fact, and a file that states it twice
 * eventually states it two different ways. (The old config carried both and
 * needed a validator to keep them honest.)
 */
export const layouts: LayoutConfig[] = site.layouts.map((row) => ({
  ...row,
  hotspots: site.hotspots.filter((h) => h.layoutId === row.id).map((h) => h.id),
}));

// ── Derived lookups ───────────────────────────────────────────────────────────

export const LAYOUT_BY_ID: Record<string, LayoutConfig> = Object.fromEntries(
  layouts.map((l) => [l.id, l]),
);

export const HOTSPOT_BY_ID: Record<string, HotspotConfig> = Object.fromEntries(
  hotspots.map((h) => [h.id, h]),
);

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
export function isFlyLayout(layoutId: string | null | undefined): boolean {
  return !!layoutId && LAYOUT_BY_ID[layoutId]?.walkable === false;
}

/** A resource has no camera of its own — it is viewed from its layout's. */
export function isFlyHotspot(hotspotId: string): boolean {
  return isFlyLayout(HOTSPOT_BY_ID[hotspotId]?.layoutId);
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
 * A layout's authored camera, resolved to a pose. No fallback — this is the
 * arithmetic on its own, so `startPose` below can use it without depending on
 * itself.
 *
 * A ground camera is authored at floor level and the runtime adds eye height
 * when it seats it, so the pitch has to be measured from the eye, not the feet.
 * An aerial camera is already at its final height.
 */
function authoredPose(layout: LayoutConfig): CameraPose {
  const eyeOffset = layout.walkable === false ? 0 : site.world.eyeHeight;
  return poseLookingAt(layout.camera.position, layout.camera.target, eyeOffset);
}

const ORIGIN_POSE: CameraPose = { position: [0, 0, 0], rotation: [0, 0, 0] };

/**
 * The layout the experience opens on — `site.json` › `startLayoutId`, a foreign
 * key into the layouts table.
 *
 * There is no separate `cameras.start` / `cameras.entry` block any more. A
 * start pose is not a fourth camera someone authors by hand; it is one of the
 * checkpoints already authored as a layout, named. The old `cameras.entry` was
 * literally L01's camera position copied into a second place, which is exactly
 * the drift this removes.
 */
export const startLayoutId: string = site.startLayoutId;

/**
 * Where the experience begins: the start layout's own camera. Everything that
 * needs "the default pose" — the Canvas camera, the first-person start, the
 * fallback for an unauthored layout or hotspot — reads THIS.
 */
export const startPose: CameraPose = (() => {
  const layout = LAYOUT_BY_ID[startLayoutId];
  if (!layout || isPlaceholder(layout.camera.position)) return ORIGIN_POSE;
  return authoredPose(layout);
})();

/** The pose to actually navigate to for a layout. */
export function poseForLayout(layoutId: string): CameraPose {
  const layout = LAYOUT_BY_ID[layoutId];
  if (!layout || isPlaceholder(layout.camera.position)) return startPose;
  return authoredPose(layout);
}

/**
 * The viewpoint a hotspot is seen from — its OWN camera, framing just this
 * marker. Falls back to the parent layout's camera while a hotspot is still
 * unauthored, which is also what it did for every hotspot before they had
 * cameras of their own.
 *
 * The eye offset follows the PARENT layout: whether the runtime adds eye height
 * on arrival is a property of the ground under the pose, and a hotspot's camera
 * stands on the same ground its layout does.
 */
export function poseForHotspot(hotspotId: string): CameraPose {
  const hotspot = HOTSPOT_BY_ID[hotspotId];
  if (!hotspot) return startPose;
  const camera = hotspot.camera;
  if (!camera || isPlaceholder(camera.position)) return poseForLayout(hotspot.layoutId);
  const eyeOffset = LAYOUT_BY_ID[hotspot.layoutId]?.walkable === false ? 0 : site.world.eyeHeight;
  return poseLookingAt(camera.position, camera.target, eyeOffset);
}

// ── Field tone resolution ─────────────────────────────────────────────────────

const TONE_LOOKUP: Record<string, Tone> = (() => {
  const map: Record<string, Tone> = {};
  (Object.keys(ui.tones) as Tone[]).forEach((tone) => {
    ui.tones[tone].forEach((word) => {
      map[word.toUpperCase()] = tone;
    });
  });
  return map;
})();

/** Explicit `tone` wins; otherwise the enum value is matched against `site.tones`. */
export function toneFor(value: string | number | boolean, explicit?: Tone): Tone | undefined {
  if (explicit) return explicit;
  if (typeof value !== "string") return undefined;
  return TONE_LOOKUP[value.toUpperCase()];
}


// ── Load-time validation (dev only) ───────────────────────────────────────────
//
// The checks a database would enforce with constraints, run here for as long as
// the tables live in a file: primary-key format, primary-key uniqueness,
// foreign-key integrity, and the demo's one cross-row invariant.
//
// The check that used to sit here for the two parentage lists agreeing is gone —
// with the child list derived, there is nothing left for it to disagree with.

if (process.env.NODE_ENV !== "production") {
  const problems: string[] = [];

  const layoutIdRe = /^L(0[1-9]|10)$/;
  const hotspotIdRe = /^H(0[1-9]|[12]\d|30)$/;

  // FOREIGN KEY — the site record names a layout that exists.
  if (!LAYOUT_BY_ID[startLayoutId]) {
    problems.push(`startLayoutId "${startLayoutId}" is not a layout`);
  }

  // PRIMARY KEY — well-formed and unique across the table.
  const seenLayout = new Set<string>();
  site.layouts.forEach((l) => {
    if (!layoutIdRe.test(l.id)) problems.push(`layout id "${l.id}" is not L01-L10`);
    if (seenLayout.has(l.id)) problems.push(`duplicate layout id "${l.id}"`);
    seenLayout.add(l.id);
  });

  const seenHotspot = new Set<string>();
  hotspots.forEach((h) => {
    if (!hotspotIdRe.test(h.id)) problems.push(`hotspot id "${h.id}" is not H01-H30`);
    if (seenHotspot.has(h.id)) problems.push(`duplicate hotspot id "${h.id}"`);
    seenHotspot.add(h.id);

    // FOREIGN KEY — every child names a layout that exists.
    if (!LAYOUT_BY_ID[h.layoutId]) {
      problems.push(`hotspot ${h.id} references unknown layout "${h.layoutId}"`);
    }

    // The demo's one cross-row invariant: every mention of the hero container
    // is the same container, so the H09 → H14 → H24 → H30 story cannot fork.
    h.fields.forEach((f) => {
      if (f.ref === "hero" && f.value !== scene.globals.heroContainerId) {
        problems.push(
          `hotspot ${h.id} field ${f.name} is marked hero but reads "${f.value}" ` +
            `(expected "${scene.globals.heroContainerId}")`,
        );
      }
    });
  });

  if (problems.length) {
    console.error("[port-config] validation failed:\n  " + problems.join("\n  "));
  }
}
