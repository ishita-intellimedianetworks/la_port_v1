export type NodeCamera = {
  name: string;
  label?: string;
  position: number[];
  rotation: number[];
};

export type DestinationCategory =
  | "restaurants"
  | "practice"
  | "transport"
  | "wellness"
  | "hostel"
  | "entrance"
  | "seating"
  | "accessibility"
  | "discovery"
  | "transit"
  | "cctv"
  | "services"
  | "seatviews"
  | "safety"
  | "layouts"
  | "crowdflow"
  | "eventupdates"
  | "infra"
  | "waterside"
  | "yard"
  | "landside"
  | "rail"
  | "executive";

/** Dining sub-mode: campus-run dining halls vs à-la-carte restaurants. Drives
 *  the two-segment toggle in the Dining panel. */
export type DiningKind = "campus" | "restaurant";

export type DestinationTransitRoute = {
  name: string;
  headwayMin: number;
  to?: string;
  seats?: number;
  mode?: "bus" | "train";
};

export type Destination = {
  id: string;
  label: string;
  thumbnail?: string;
  camera?: { position: [number, number, number]; rotation: [number, number, number] };
  hotspot?: { position: [number, number, number]; label?: string };
  hotspots?: {
    position: [number, number, number];
    rotation?: [number, number, number];
    label?: string;
    /** Guest-facing intro paragraph for this hotspot's info popup (wins over
     *  the destination-level note). */
    note?: string;
    /** Short highlight rows rendered as an accented list under the note —
     *  "what this desk can help with" bullets. */
    points?: string[];
  }[];
  showHsIn3d?: boolean;
  teleportOnly?: boolean;
  /** Short descriptor chips shown on the card (e.g. "Healthy", "Indoor", "$$"). */
  tags?: string[];
  /** Open/available status — drives the green "Open" dot + the "Open now" filter. */
  open?: boolean;
  /** Free-text status line on the card (e.g. "2 courts free", "Lanes open"). */
  note?: string;
  /** Dining only — which sub-mode (campus dining hall vs restaurant) this is. */
  kind?: DiningKind;
  /** Restaurants only — sample menu items shown on the card (e.g. "Pizza"). */
  menu?: string[];
  /** Practice only — the sports trained here (one venue can host several at
   *  once, e.g. ["Swimming","Diving"]); drives the sport segment filter. */
  sports?: string[];
  option?: string;
  /** Per-destination congestion (authored), drives the list badge + the
   *  fastest-entry reroute. */
  crowd?: CrowdLevel;
  /** Congestion detail shown on the badge, e.g. "Moderate · ~6 min wait". */
  crowdNote?: string;
  /** Transport hubs only — bus/train routes serving this hub (for live timings). */
  transit?: { routes: DestinationTransitRoute[] };
  exactPose?: boolean;
  /** Seat-view only — the bowl section number, used to place + label this seat
   *  on the theatre-style seat map. */
  section?: number;
};

/** A transit line a traveller boards at a hub to reach a destination venue. */
export type TransportLine = {
  mode: "bus" | "train";
  name: string;
};

export type TransportDestination = {
  id: string;
  label: string;
  /** Sport / what happens there — shown as the card's meta line. */
  sport?: string;
  /** id of the transport hub destination in this scene to catch transit at. */
  hubId: string;
  /** Lines to board at the hub for this destination. */
  lines: TransportLine[];
  accessible?: boolean;
};

/** destinations grouped by category label, projected from `<site>.json` › `zones`. */
export type DestinationsByCategory = Partial<Record<DestinationCategory, Destination[]>>;

/** Event-day update feed item (closures, alerts, schedule changes, info). Not a
 *  navmesh destination — rendered as a chronological feed in the Event Day panel. */
export type EventUpdateKind = "schedule" | "closure" | "alert" | "info";
export type EventUpdate = {
  id: string;
  kind: EventUpdateKind;
  title: string;
  /** Supporting line under the title. */
  detail?: string;
  /** Free-text time/window chip (e.g. "Now", "19:00", "Until 20:00"). */
  time?: string;
  /** Drives the accent colour + ordering emphasis. Defaults to "low". */
  severity?: "high" | "medium" | "low";
};

export type LayoutsConfig = {
  id: string;
  label: string;
  imageUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  floorId?: string;
};

export type FurnitureConfig = {
  modelUrl?: string;
  groups?: string[];
  textureSwaps?: Record<string, string>;
};

export type TransitionCamera = {
  position: [number, number, number];
  rotation: [number, number, number];
};

export type FloorTransition = {
  /** Mesh name inside the source floor's GLB (case-sensitive). */
  meshName: string;
  hotspotName?: string;
  /** Destination floor id (must exist in floors[]). */
  targetFloorId: string;
  swapAtCamera: number;
  /** Camera waypoints, in order. The current pose is the implicit start. */
  cameras: TransitionCamera[];
};

export type LightsConfig = {
  /** Ambient fill intensity. Default 0.8. */
  ambientIntensity?: number;
  /** Ambient fill colour (hex). Default "#ffffff". */
  ambientColor?: string;
  hemiIntensity?: number;
  /** Sky-fill colour from above (hex). Default "#ffffff". */
  hemiSkyColor?: string;
  /** Sky-fill colour from below — the ground bounce (hex). Default "#ffffff". */
  hemiGroundColor?: string;
  /** HDR image-based lighting intensity. Default 0.65. */
  envIntensity?: number;
  /** Environment HDRI file (public path) used for image-based lighting +
   *  reflections. Default "/env.hdr"; interiors point at a city HDRI. */
  envFile?: string;
  envRotation?: number;
  /** Sun (directional) intensity. Default 7.9. */
  sunIntensity?: number;
  /** Sun colour (hex). Default "#ffffff". */
  sunColor?: string;
  /** Sun direction, un-normalised (normalised at runtime). Default [-1.5, 5.9, -2.6]. */
  sunDirection?: [number, number, number];
  /** Square shadow-map resolution. Default 2048. */
  shadowMapSize?: number;
  /** Shadow softening radius. Default 0.5. */
  shadowRadius?: number;
  /** Shadow depth bias. Default -0.0005. */
  shadowBias?: number;
  /** Shadow normal bias. Default 0.55. */
  shadowNormalBias?: number;
  shadowFollowExtent?: number;
  /** Interior spot-light intensity (candela; physical falloff). Default 12. */
  spotIntensity?: number;
  /** Interior spot-light colour (hex). Default "#fff4e0" (warm bulb). */
  spotColor?: string;
  /** Height of the fixture ABOVE the room's bounds centre (world units), i.e.
   *  how far toward the ceiling it hangs. Default 0.6. */
  spotHeight?: number;
  /** Cone half-angle in radians (0..π/2). Wider = lights more of the room.
   *  Default 1.0 (~57°). */
  spotAngle?: number;
  /** Soft cone edge, 0 (hard) … 1 (fully soft). Default 0.5. */
  spotPenumbra?: number;
  /** Spot range; 0 = no cutoff (inverse-square only). Default 0. */
  spotDistance?: number;
  /** Spot distance decay exponent. Default 2 (physically correct). */
  spotDecay?: number;
  controls?: boolean;
};

/** A fully-resolved lights set (every field present) — defaults merged with a
 *  venue's overrides. This is what the live controls edit and SceneLights renders. */
export type ResolvedLights = Required<Omit<LightsConfig, "controls">>;

export type FloorConfig = {
  id: string;
  label: string;
  modelUrl: string;
  streamed?: boolean;
  navmeshUrl: string;
  boundsUrl?: string;
  floorPlanUrl?: string | null;
  /** Per-venue lighting overrides. See `LightsConfig`; omitted → shared defaults. */
  lights?: LightsConfig;
  interior?: boolean;
  /** Whether this floor casts/receives the sun's shadow. Defaults to true.
   *  Set false (e.g. the stadium) to drop all shadow cost for that floor. */
  shadows?: boolean;
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  dollHouseCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  dollhouseOnly?: boolean;
  mapListMode?: boolean;
  clickSnapToNav?: boolean;
  routeSanitize?: boolean;
  stickers?: {
    x: number;
    z: number;
    label: string;
    angle?: number;
    length?: number;
    lookAt?: { x: number; z: number };
  }[];
  layouts?: LayoutsConfig[];
  layoutsInfo?: { id: string; name: string; meta?: string }[];
  furniture?: FurnitureConfig;
  transitions?: FloorTransition[];
  hsSize?: number;
  /** Points of interest, grouped by category label (restaurants/practice/transport). */
  dests?: DestinationsByCategory;
  /** Destination venues for the transport flow — each references a `hubId` in
   *  this floor's `dests.transport` to catch transit at. */
  transportDestinations?: TransportDestination[];
  /** Event-day update feed (closures, alerts, schedule, info). Drives the Event
   *  Day panel + its launcher; floors without it never show the button. */
  events?: EventUpdate[];
  /** Crowd Flow feed — per-area live congestion status. Drives the Crowd Flow
   *  panel + its launcher; floors without it never show the button. */
  crowdFeed?: CrowdRow[];
  crowdFlow?: CrowdFlowConfig;
  crowdFlowGlb?: {
    url: string;
    levels: Record<string, CrowdLevel>;
    flyCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  };
};

/** Congestion tiers → colour (low=green, med=amber, high=red). */
export type CrowdLevel = "low" | "med" | "high";

export type CrowdZone = {
  /** World [x, z] centre. */
  center: [number, number];
  /** World-unit radius. */
  radius: number;
  level: CrowdLevel;
  /** Optional human label for the badge (e.g. "Main gate"). */
  label?: string;
};

export type CrowdFlowConfig = {
  zones: CrowdZone[];
};

/** A row in the Crowd Flow feed panel — one area's live congestion status. */
export type CrowdRow = {
  name: string;
  /** e.g. "Heavy congestion", "Moderate flow", "Clear". */
  status: string;
  /** e.g. "~14 min", "<2 min", "flowing". */
  wait: string;
  level: CrowdLevel;
};

export type NodeData = {
  id: string;
  raycastName: string | string[];
  /** Mesh name in the selection/highlight GLB that tints on hover/active.
   *  Optional — structural nodes (e.g. floors) without a mesh just won't tint. */
  highlightMeshName?: string;
  /** Friendly unit number used in the interior URL, e.g. "28" → /interior/28. */
  urlId?: string;
  listInApartments?: boolean;
  meta?: Record<string, unknown>;
  cameras: NodeCamera[];
  children?: NodeData[];
  floors?: FloorConfig[];
  furniture?: FurnitureConfig;
  speed?: number;
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  dollHouseCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  dollHouseModelUrl?: string;
  dollHousePreviewUrl?: string;
  unitName?: string;
  transitionCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  layouts?: LayoutsConfig[];
};

export function canExploreInterior(node: NodeData): boolean {
  return !!(node.floors?.some(f => f.modelUrl && f.navmeshUrl));
}

export const fmt = (raw: string | string[]) => {
  const s = Array.isArray(raw) ? (raw[0] ?? "") : raw;
  return s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
};

export const toStr = (v: unknown, fallback = "") =>
  v != null && v !== "" ? String(v) : fallback;

export const fmtCamLabel = (cam: NodeCamera, idx: number) => {
  if (cam.label) return cam.label;
  const match = cam.name.match(/_(\d+)$/);
  return match ? `View ${match[1]}` : `View ${idx + 1}`;
};

export function findNode(nodeList: NodeData[], id: string): NodeData | null {
  for (const n of nodeList) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}
