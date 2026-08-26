/* eslint-disable @typescript-eslint/no-explicit-any */
import { HOTSPOT_BY_ID, layouts, scene, startPose, ui } from "@/config";
import { STREAM_ASSET_BASE } from "@/streaming/config";
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
    // The WALKING view streams as distance-tiered chunks whenever site.json
    // authors a `stream` block. The dollhouse never does — it draws
    // `assets.modelUrl` as one decimated GLB, which is what `modelUrl` is for
    // now. Everything about HOW it streams lives in that block.
    streamed: !!scene.stream,
    // The navmesh travels WITH the chunks: the bake emits it next to them, so
    // it follows NEXT_PUBLIC_ASSET_BASE to a CDN and there is no second copy in
    // public/ to keep in step. It is the same 3,988 triangles as the raw export,
    // Draco-compressed — 8 KB against 305. `assets.navmeshUrl` is the fallback
    // for a site that authors no stream block.
    navmeshUrl: scene.stream ? `${STREAM_ASSET_BASE}navmesh.glb` : scene.assets.navmeshUrl!,
    // Legacy map plan; this site uses `map.plan` instead.
    floorPlanUrl: scene.assets.floorPlan ?? null,
    // Where first person begins. Authored as `cameras.spawn`, NOT derived from
    // the start layout: every layout here is an aerial framing (walkable:
    // false), and deriving it anyway put the walking start 381 m up and off the
    // navmesh entirely. See the `_note` on that block.
    startPosition: v3(scene.cameras.spawn.position),
    startRotation: v3(scene.cameras.spawn.rotation),
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
    // The dollhouse draws the single decimated GLB — the walking view is the
    // half that streams. Naming it explicitly here (rather than falling through
    // to the floor's modelUrl) is what lets the two diverge: point
    // `assets.modelUrl` at a purpose-built low-poly overview mesh and only the
    // dollhouse changes.
    dollHouseModelUrl: scene.assets.modelUrl,
    // The point-cloud sidecar shown behind the loading HUD while that GLB loads.
    dollHousePreviewUrl: scene.assets.previewUrl,
    startPosition: floors[0].startPosition,
    startRotation: floors[0].startRotation,
    unitName: scene.meta.label,
  },
];

export const defaultSiteId: string = SITE_ID;

/**
 * Initial pose the shared Canvas camera is created at, for the frames before
 * DollhouseCamera seats itself at `cameras.dollhouse`. It is the start LAYOUT's
 * camera — an overview framing, which is the right thing to open on, and NOT
 * where the player begins: that is `cameras.spawn`, on the ground.
 */
export const entry = {
  position: v3(startPose.position),
  rotation: v3(startPose.rotation),
};
