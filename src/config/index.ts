/**
 * The single entry point to the four config files. Nothing else in the app
 * imports the JSON directly, and nothing hardcodes a URL, a pose or a value.
 *
 *   scene.json    → model / navmesh / preview URLs, lights, cameras, world params
 *   ui.json       → every piece of on-screen copy, the theme, zone colours
 *   layouts.json  → L01-L10
 *   hotspots.json → H01-H30
 */

import sceneJson from "./scene.json";
import uiJson from "./ui.json";
import layoutsJson from "./layouts.json";
import hotspotsJson from "./hotspots.json";

import type {
  CameraPose,
  HotspotConfig,
  LayoutConfig,
  SceneConfig,
  Tone,
  UiConfig,
  Vec3,
  ZoneKey,
} from "./schema";

export const scene = sceneJson as unknown as SceneConfig;
export const ui = uiJson as unknown as UiConfig;
export const layouts = (layoutsJson as unknown as { layouts: LayoutConfig[] }).layouts;
export const hotspots = (hotspotsJson as unknown as { hotspots: HotspotConfig[] }).hotspots;

// ── Derived lookups ───────────────────────────────────────────────────────────

export const LAYOUT_BY_ID: Record<string, LayoutConfig> = Object.fromEntries(
  layouts.map((l) => [l.id, l]),
);

export const HOTSPOT_BY_ID: Record<string, HotspotConfig> = Object.fromEntries(
  hotspots.map((h) => [h.id, h]),
);

export const ZONE_ORDER: ZoneKey[] = ["waterside", "yard", "landside", "rail", "executive"];

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
 * Every position, rotation and camera in `layouts.json` / `hotspots.json` sits
 * at `[0,0,0]` until it is authored against the real Everport model. Rather
 * than a flag someone has to remember to flip, the runtime just recognises the
 * origin: navigation falls back to `scene.cameras.start` and markers that would
 * pile up on the world origin are suppressed. Both behaviours disappear on
 * their own the moment real values land.
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

/** The pose to actually navigate to for a layout. */
export function poseForLayout(layoutId: string): CameraPose {
  const layout = LAYOUT_BY_ID[layoutId];
  if (!layout || isPlaceholder(layout.camera.position)) return scene.cameras.start;
  // A ground camera is authored at floor level and the runtime adds eye height
  // when it seats it, so the pitch has to be measured from the eye, not the feet.
  const eyeOffset = layout.walkable === false ? 0 : scene.world.eyeHeight;
  return poseLookingAt(layout.camera.position, layout.camera.target, eyeOffset);
}

const samePoint = (a: Vec3, b: Vec3) =>
  Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01;

/**
 * The layout the experience opens in: whichever one shares the scene's start
 * pose, since that is literally where the player is standing. Falls back to the
 * first walkable layout.
 */
export const defaultLayoutId: string =
  layouts.find((l) => samePoint(l.camera.position, scene.cameras.start.position))?.id ??
  layouts.find((l) => l.walkable !== false)?.id ??
  layouts[0].id;

/**
 * The viewpoint a hotspot is seen from — its layout's camera. Several markers
 * share one, so travelling between two hotspots of the same layout does not
 * move the camera at all.
 */
export function poseForHotspot(hotspotId: string): CameraPose {
  const hotspot = HOTSPOT_BY_ID[hotspotId];
  if (!hotspot) return scene.cameras.start;
  return poseForLayout(hotspot.layoutId);
}

/**
 * Where first person begins. An aerial layout is not a valid entry point — the
 * dollhouse fly-in has to land somewhere the player can stand — so those fall
 * back to the scene start.
 */
export function entryPoseForLayout(layoutId: string): CameraPose {
  const layout = LAYOUT_BY_ID[layoutId];
  if (!layout || layout.walkable === false) return scene.cameras.start;
  return poseForLayout(layoutId);
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

/** Explicit `tone` wins; otherwise the enum value is matched against ui.json. */
export function toneFor(value: string | number | boolean, explicit?: Tone): Tone | undefined {
  if (explicit) return explicit;
  if (typeof value !== "string") return undefined;
  return TONE_LOOKUP[value.toUpperCase()];
}

export function badgeFor(dataSource: HotspotConfig["dataSource"]): string {
  if (dataSource === "static") return ui.popup.staticBadge;
  if (dataSource === "live") return ui.popup.liveBadge;
  return ui.popup.demoBadge;
}

// ── Load-time validation (dev only) ───────────────────────────────────────────
//
// A broken id or a drifted hero-container value should fail loudly here rather
// than silently producing an empty panel or an inconsistent demo story.

if (process.env.NODE_ENV !== "production") {
  const problems: string[] = [];

  const layoutIdRe = /^L(0[1-9]|10)$/;
  const hotspotIdRe = /^H(0[1-9]|[12]\d|30)$/;

  layouts.forEach((l) => {
    if (!layoutIdRe.test(l.id)) problems.push(`layout id "${l.id}" is not L01-L10`);
    l.hotspots.forEach((h) => {
      if (!HOTSPOT_BY_ID[h]) problems.push(`layout ${l.id} references unknown hotspot "${h}"`);
    });
  });

  hotspots.forEach((h) => {
    if (!hotspotIdRe.test(h.id)) problems.push(`hotspot id "${h.id}" is not H01-H30`);
    if (!LAYOUT_BY_ID[h.layoutId]) {
      problems.push(`hotspot ${h.id} references unknown layout "${h.layoutId}"`);
    } else if (!LAYOUT_BY_ID[h.layoutId].hotspots.includes(h.id)) {
      problems.push(`hotspot ${h.id} is not listed by its layout ${h.layoutId}`);
    }
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
