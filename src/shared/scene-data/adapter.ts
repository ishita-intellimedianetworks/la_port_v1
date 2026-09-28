/* eslint-disable @typescript-eslint/no-explicit-any */
import { poseForCamera, type Site, type SiteId } from "@/config";
import { STREAM_VARIANTS } from "@/streaming/config";
import type { DestinationsByCategory } from "../types";

type V3 = [number, number, number];

const WALK_SPEED = 3;

const HOTSPOT_SIZE = 3;

const ROUTE_SANITIZE = false;

const round = (v: number): number => Math.round(v * 10000) / 10000;
const v3 = (a: readonly number[]): V3 => [round(a[0]), round(a[1]), round(a[2])];

export const SITE_NODE_ID = "site";

export interface SceneData {
  nodes: any[];
  entry: { position: V3; rotation: V3 };
}

function build(site: Site): SceneData {
  const { scene, ui, layouts, hotspotById } = site;

  const dests: DestinationsByCategory = {};
  for (const layout of layouts) {
    const aerial = layout.walkable === false;
    const eyeOffset = aerial ? 0 : scene.world.eyeHeight;

    (dests[layout.zone] ??= []).push({
      id: layout.id,
      label: layout.name,
      note: layout.description,
      open: true,
      option: ui.zones[layout.zone]?.label ?? layout.zone,
      camera: (() => {
        const pose = poseForCamera(layout.camera, eyeOffset);
        return { position: v3(pose.position), rotation: v3(pose.rotation) };
      })(),
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
      streamed: !!scene.stream,
      navmeshUrl: scene.stream ? STREAM_VARIANTS[site.id].navmeshUrl : scene.assets.navmeshUrl!,
      floorPlanUrl: scene.assets.floorPlan ?? null,
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
      dollHouseModelUrl: scene.assets.modelUrl,
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

const cache = new Map<SiteId, SceneData>();

export function sceneDataFor(site: Site): SceneData {
  let data = cache.get(site.id);
  if (!data) {
    data = build(site);
    cache.set(site.id, data);
  }
  return data;
}
