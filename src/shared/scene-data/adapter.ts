/* eslint-disable @typescript-eslint/no-explicit-any */
import cfg from "./scenes.json";
import type { CrowdFlowConfig, CrowdLevel, CrowdRow, EventUpdate, FloorTransition, LightsConfig, DestinationsByCategory, TransportDestination } from "../types";

/**
 * Two-model site adapter.
 *
 * The interior engine (player, navmesh, minimap, dollhouse, fade-swap) is
 * driven by a single node whose `floors[]` are the TWO swappable models
 * (village + jrtc). Swapping the active "floor" via the fade transition IS the
 * model swap — the whole v5 player/loading/minimap pipeline is reused as-is.
 *
 * Edit `scenes.json` to change the models, start poses, speed, or dollhouse
 * camera — nothing else needs touching.
 */

type V3 = [number, number, number];
const v3 = (a: number[]): V3 => [a[0], a[1], a[2]];

const scenes = cfg.scenes as Array<{
  key: string;
  label: string;
  url: string;
  /** Point-cloud sidecar (.preview.bin) shown by the loading screen while the
   *  model downloads. Only the FIRST scene's preview is used — it is the one
   *  loading behind the initial HUD; venue swaps stay on the blackout. */
  previewUrl?: string;
  navmeshUrl: string;
  startPosition?: number[];
  startRotation?: number[];
  dollHouseCamera?: { position: number[]; rotation: number[] };
  dollhouseOnly?: boolean;
  floorplanUrl?: string;
  mapListMode?: boolean;
  clickSnapToNav?: boolean;
  routeSanitize?: boolean;
  /** Authored under the legacy "pois" key in scenes.json. */
  pois?: DestinationsByCategory;
  /** 3D hotspot marker disc radius (world units) — see FloorConfig.hsSize. */
  hsSize?: number;
  transportDestinations?: TransportDestination[];
  events?: EventUpdate[];
  crowdFlow?: CrowdFlowConfig;
  crowdFeed?: CrowdRow[];
  crowdFlowGlb?: {
    url: string;
    levels: Record<string, CrowdLevel>;
    flyCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  };
  transitions?: FloorTransition[];
  interior?: boolean;
  shadows?: boolean;
  lights?: LightsConfig;
  eyeHeight?: number;
}>;

const floors = scenes.map((s) => ({
  id:            s.key,
  label:         s.label,
  modelUrl:      s.url,
  navmeshUrl:    s.navmeshUrl,
  floorPlanUrl:  s.floorplanUrl ?? null,
  startPosition: s.startPosition ? v3(s.startPosition) : undefined,
  startRotation: s.startRotation ? v3(s.startRotation) : undefined,
  dollHouseCamera: s.dollHouseCamera
    ? { position: v3(s.dollHouseCamera.position), rotation: v3(s.dollHouseCamera.rotation) }
    : undefined,
  dollhouseOnly: s.dollhouseOnly,
  mapListMode:   s.mapListMode,
  clickSnapToNav: s.clickSnapToNav,
  routeSanitize: s.routeSanitize,
  dests:         s.pois,
  hsSize:        s.hsSize,
  transportDestinations: s.transportDestinations,
  events:        s.events,
  crowdFlow:     s.crowdFlow,
  crowdFeed:     s.crowdFeed,
  crowdFlowGlb:  s.crowdFlowGlb,
  transitions:   s.transitions,
  interior:      s.interior,
  shadows:       s.shadows,
  lights:        s.lights,
  cameraHeight:  s.eyeHeight,
}));

const SITE_ID = "site";

// One node; its floors are the two models. The toggle swaps activeFloorIndex,
// which the existing fade transition drives exactly like a floor change.
export const nodes: any[] = [
  {
    id:            SITE_ID,
    raycastName:   SITE_ID,
    cameras:       [],
    children:      [],
    floors,
    speed:         cfg.speed,
    dollHouseCamera: cfg.dollHouseCamera
      ? { position: v3(cfg.dollHouseCamera.position), rotation: v3(cfg.dollHouseCamera.rotation) }
      : undefined,
    // The initial (dollhouse) load shows the FIRST venue's point-cloud preview
    // behind the loading HUD while its GLB streams in.
    dollHousePreviewUrl: scenes[0]?.previewUrl,
    startPosition: floors[0]?.startPosition,
    startRotation: floors[0]?.startRotation,
    unitName:      cfg.label,
  },
];

export const defaultSiteId: string = SITE_ID;

// Initial pose the shared Canvas camera is created at, before the player /
// dollhouse camera takes over.
export const entry = {
  position: v3(cfg.entry.position),
  rotation: v3(cfg.entry.rotation),
};
