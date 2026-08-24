/* eslint-disable @typescript-eslint/no-explicit-any */
import { HOTSPOT_BY_ID, layouts, scene, startPose, ui } from "@/config";
import type { DestinationsByCategory } from "../types";

/**
 * Site adapter — projects `src/config/site.json` onto the shape the engine
 * reads (nodes › floors › destinations).
 *
 * The mapping is direct, because the two models agree: the engine's
 * `Destination` is one saved camera plus the `hotspots[]` markers that share
 * it, which is exactly a layout and its hotspots. So
 *
 *     layout   ->  destination                (its camera, grouped under its zone)
 *     hotspot  ->  destination.hotspots[i]    (a marker only)
 *     zone     ->  destination category
 *
 * This USED TO BE a build step (`scripts/build-scenes.cjs`) writing a
 * `scenes.json` the app then imported — which meant every camera, marker,
 * light and URL existed twice in the repo, in two different shapes, and a
 * `site.json` edit did nothing until someone remembered to re-run the script.
 * The projection is a dozen lines of pure arithmetic, so it runs at import
 * instead and there is exactly one copy of the data.
 */

type V3 = [number, number, number];

// ── Engine settings ───────────────────────────────────────────────────────────
// Tuning for THIS model, not authored content — which is why they live here
// rather than in site.json.

/** Base walk speed for the in-scene walker (double-click the floor). The UI
 *  multiplier lives in src/terminal/navigation-config.ts. */
const WALK_SPEED = 3;

/** Marker disc radius in world units. The terminal is authored 1:1 in metres
 *  and is ~1 km across, so a 0.6 m disc (sized for the 530-unit village)
 *  vanished at the 100-200 m the markers actually sit at. */
const HOTSPOT_SIZE = 3;

/** The navmesh is a clean single-surface Recast export, so the engine's
 *  height-band / slope sanitation (built for a polluted stadium mesh) would
 *  only reject legitimate routes here. */
const ROUTE_SANITIZE = false;

const round = (v: number): number => Math.round(v * 10000) / 10000;
const v3 = (a: readonly number[]): V3 => [round(a[0]), round(a[1]), round(a[2])];

/**
 * Layout cameras are stored as position + target (handoff §4). The engine
 * applies a YXZ euler, so convert here.
 *
 * Three.js cameras look down -Z, making forward
 * `(-cos(pitch)sin(yaw), sin(pitch), -cos(pitch)cos(yaw))`; inverting it gives
 * `yaw = atan2(-dx, -dz)`. Dropping those minus signs aims every camera 180°
 * away from its subject.
 */
function rotationLookingAt(position: V3, target: V3, eyeOffset: number): V3 {
  const dx = target[0] - position[0];
  const dy = target[1] - (position[1] + eyeOffset);
  const dz = target[2] - position[2];
  const flat = Math.hypot(dx, dz);
  return [round(Math.atan2(dy, flat)), round(Math.atan2(-dx, -dz)), 0];
}

// ── Zones become the engine's destination categories ──────────────────────────

const dests: DestinationsByCategory = {};
for (const layout of layouts) {
  // An aerial pose keeps its authored height instead of dropping to the
  // navmesh, and is teleported to rather than walked to.
  const aerial = layout.walkable === false;
  const eyeOffset = aerial ? 0 : scene.world.eyeHeight;

  (dests[layout.zone] ??= []).push({
    id: layout.id,
    label: layout.name,
    note: layout.description,
    open: true,
    option: ui.zones[layout.zone]?.label ?? layout.zone,
    camera: {
      position: v3(layout.camera.position),
      rotation: rotationLookingAt(layout.camera.position, layout.camera.target, eyeOffset),
    },
    // Every marker in this layout shares the camera above — the engine routes
    // a tap on any of them back to it.
    hotspots: layout.hotspots.map((id) => {
      const h = HOTSPOT_BY_ID[id];
      return { position: v3(h.position), rotation: v3(h.rotation), label: `${h.id} · ${h.name}` };
    }),
    showHsIn3d: true,
    ...(aerial ? { exactPose: true, teleportOnly: true } : null),
  } as any);
}

// ── The single node, whose one floor is the terminal model ────────────────────

const floors = [
  {
    id: "terminal",
    label: scene.meta.label,
    modelUrl: scene.assets.modelUrl,
    navmeshUrl: scene.assets.navmeshUrl,
    floorPlanUrl: null,
    // Where first person begins — the start LAYOUT's camera, not a camera of
    // its own (site.json › startLayoutId).
    startPosition: v3(startPose.position),
    startRotation: v3(startPose.rotation),
    clickSnapToNav: true,
    routeSanitize: ROUTE_SANITIZE,
    dests,
    hsSize: HOTSPOT_SIZE,
    shadows: scene.world.shadows,
    lights: scene.lights,
    cameraHeight: scene.world.eyeHeight,
  },
];

const SITE_ID = "site";

export const nodes: any[] = [
  {
    id: SITE_ID,
    raycastName: SITE_ID,
    cameras: [],
    children: [],
    floors,
    speed: WALK_SPEED,
    dollHouseCamera: {
      position: v3(scene.cameras.dollhouse.position),
      rotation: v3(scene.cameras.dollhouse.rotation),
    },
    // The point-cloud sidecar shown behind the loading HUD while the GLB streams.
    dollHousePreviewUrl: scene.assets.previewUrl,
    startPosition: floors[0].startPosition,
    startRotation: floors[0].startRotation,
    unitName: scene.meta.label,
  },
];

export const defaultSiteId: string = SITE_ID;

/**
 * Initial pose the shared Canvas camera is created at, before the player /
 * dollhouse camera takes over — the same start-layout pose the player begins
 * at, so the two cannot disagree. (`cameras.entry` used to hold a second copy
 * of that camera's position, hand-kept in step.)
 */
export const entry = {
  position: v3(startPose.position),
  rotation: v3(startPose.rotation),
};
