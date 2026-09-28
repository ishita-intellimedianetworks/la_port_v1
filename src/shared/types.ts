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
    note?: string;
    points?: string[];
  }[];
  showHsIn3d?: boolean;
  teleportOnly?: boolean;
  tags?: string[];
  open?: boolean;
  note?: string;
  kind?: DiningKind;
  menu?: string[];
  sports?: string[];
  option?: string;
  crowd?: CrowdLevel;
  crowdNote?: string;
  transit?: { routes: DestinationTransitRoute[] };
  exactPose?: boolean;
  section?: number;
};

export type TransportLine = {
  mode: "bus" | "train";
  name: string;
};

export type TransportDestination = {
  id: string;
  label: string;
  sport?: string;
  hubId: string;
  lines: TransportLine[];
  accessible?: boolean;
};

export type DestinationsByCategory = Partial<Record<DestinationCategory, Destination[]>>;

export type EventUpdateKind = "schedule" | "closure" | "alert" | "info";
export type EventUpdate = {
  id: string;
  kind: EventUpdateKind;
  title: string;
  detail?: string;
  time?: string;
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
  meshName: string;
  hotspotName?: string;
  targetFloorId: string;
  swapAtCamera: number;
  cameras: TransitionCamera[];
};

export type LightsConfig = {
  ambientIntensity?: number;
  ambientColor?: string;
  hemiIntensity?: number;
  hemiSkyColor?: string;
  hemiGroundColor?: string;
  envIntensity?: number;
  envFile?: string;
  envRotation?: number;
  sunIntensity?: number;
  sunColor?: string;
  sunDirection?: [number, number, number];
  shadowMapSize?: number;
  shadowRadius?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
  shadowFollowExtent?: number;
  spotIntensity?: number;
  spotColor?: string;
  spotHeight?: number;
  spotAngle?: number;
  spotPenumbra?: number;
  spotDistance?: number;
  spotDecay?: number;
  controls?: boolean;
};

export type ResolvedLights = Required<Omit<LightsConfig, "controls">>;

export type FloorConfig = {
  id: string;
  label: string;
  modelUrl: string;
  streamed?: boolean;
  navmeshUrl: string;
  boundsUrl?: string;
  floorPlanUrl?: string | null;
  lights?: LightsConfig;
  interior?: boolean;
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
  dests?: DestinationsByCategory;
  transportDestinations?: TransportDestination[];
  events?: EventUpdate[];
  crowdFeed?: CrowdRow[];
  crowdFlow?: CrowdFlowConfig;
  crowdFlowGlb?: {
    url: string;
    levels: Record<string, CrowdLevel>;
    flyCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  };
};

export type CrowdLevel = "low" | "med" | "high";

export type CrowdZone = {
  center: [number, number];
  radius: number;
  level: CrowdLevel;
  label?: string;
};

export type CrowdFlowConfig = {
  zones: CrowdZone[];
};

export type CrowdRow = {
  name: string;
  status: string;
  wait: string;
  level: CrowdLevel;
};

export type NodeData = {
  id: string;
  raycastName: string | string[];
  highlightMeshName?: string;
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
