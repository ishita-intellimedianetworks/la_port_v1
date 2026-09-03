/* eslint-disable @typescript-eslint/no-explicit-any */
import { poseForCamera, type Site, type SiteId } from "@/config";
import { STREAM_VARIANTS } from "@/streaming/config";
import type { DestinationsByCategory } from "../types";

/**
 * Site adapter — projects ONE model's config file onto the shape the engine
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
 * config edit did nothing until someone remembered to re-run the script.
 * The projection is a dozen lines of pure arithmetic, so it runs on demand
 * instead and there is exactly one copy of the data.
 *
 * PER MODEL, NOT PER APP. It used to be a module-level `nodes` built at import
 * from the one `site.json`. Now that each route has its own document —
 * different cameras, different lights, a different bake — the tree is built for
 * the site it is asked about and cached under that id, so all three can be held
 * at once and none of them can be read by the wrong route.
 */

type V3 = [number, number, number];

// Engine settings
// Tuning for THIS model family, not authored content — which is why they live
// here rather than in the site files.

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

/** The engine's id for the one node every site projects to. NOT a model id —
 *  `SiteId` ("v1" | "v2" | "v3") is that. */
export const SITE_NODE_ID = "site";

export interface SceneData {
  /** The engine's node tree — one node, its floor, and that floor's
   *  destinations. */
  nodes: any[];
  /**
   * Initial pose the shared Canvas camera is created at, for the frames before
   * DollhouseCamera seats itself at `cameras.dollhouse`. It is the start
   * LAYOUT's camera — an overview framing, which is the right thing to open on,
   * and NOT where the player begins: that is `cameras.spawn`, on the ground.
   */
  entry: { position: V3; rotation: V3 };
}

function build(site: Site): SceneData {
  const { scene, ui, layouts, hotspotById } = site;

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
      // A layout camera is authored either as an XYZ rotation (straight off its
      // `cp_NNN` node, in the order /extract-pos prints) or as a point to look at,
      // and `poseForCamera` resolves both to the YXZ euler the engine applies.
      // That arithmetic used to be copied here as well, so the two could round one
      // pose differently — and once cameras could carry an authored rotation, the
      // copy would have quietly ignored it and gone on deriving one.
      camera: (() => {
        const pose = poseForCamera(layout.camera, eyeOffset);
        return { position: v3(pose.position), rotation: v3(pose.rotation) };
      })(),
      // Every marker in this layout shares the camera above — the engine routes
      // a tap on any of them back to it.
      hotspots: layout.hotspots.map((id) => {
        const h = hotspotById[id];
        return { position: v3(h.position), rotation: v3(h.rotation), label: h.name };
      }),
      showHsIn3d: true,
      ...(aerial ? { exactPose: true, teleportOnly: true } : null),
    } as any);
  }

  const floors = [
    {
      id: "terminal",
      label: scene.meta.label,
      modelUrl: scene.assets.modelUrl,
      // BOTH views stream as distance-tiered chunks whenever the site file
      // authors a `stream` block — the dollhouse under `stream.dollhouse`, which
      // flattens every chunk onto the coarsest tier. `modelUrl` below is the
      // fallback for a site that authors no such block. Everything about HOW it
      // streams lives in that block.
      streamed: !!scene.stream,
      // The navmesh travels WITH the chunks: the bake emits it next to them, so
      // it follows the asset base to a CDN and there is no second copy in public/
      // to keep in step. `assets.navmeshUrl` is the fallback for a site that
      // authors no stream block.
      // THIS MODEL'S navmesh, and only ever this model's — the tree is built per
      // site now, so a route can no longer end up walking on another bake's
      // navmesh, which was a subtle and nasty bug when the tree was global.
      navmeshUrl: scene.stream ? STREAM_VARIANTS[site.id].navmeshUrl : scene.assets.navmeshUrl!,
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

  const nodes: any[] = [
    {
      id: SITE_NODE_ID,
      raycastName: SITE_NODE_ID,
      cameras: [],
      children: [],
      floors,
      speed: WALK_SPEED,
      dollHouseCamera: {
        position: v3(scene.cameras.dollhouse.position),
        rotation: v3(scene.cameras.dollhouse.rotation),
      },
      // The overview's own GLB, kept wired for a site with no `stream` block.
      // With one authored the dollhouse streams instead and this goes unread —
      // see `stream.dollhouse` in the site file.
      dollHouseModelUrl: scene.assets.modelUrl,
      // The point-cloud sidecar shown behind the loading HUD while the overview
      // fills in. Still baked from `assets.modelUrl`, which is the same zone at
      // the same scale whether or not that GLB is the thing being drawn.
      dollHousePreviewUrl: scene.assets.previewUrl,
      startPosition: floors[0].startPosition,
      startRotation: floors[0].startRotation,
      unitName: scene.meta.label,
    },
  ];

  return {
    nodes,
    entry: { position: v3(site.startPose.position), rotation: v3(site.startPose.rotation) },
  };
}

/** Built once per model and kept — the projection is pure, and both the
 *  provider and the Canvas ask for it on every render. */
const cache = new Map<SiteId, SceneData>();

export function sceneDataFor(site: Site): SceneData {
  let data = cache.get(site.id);
  if (!data) {
    data = build(site);
    cache.set(site.id, data);
  }
  return data;
}
