import { nodes } from "@/shared/scene-data/adapter";

// ── Core data types ───────────────────────────────────────────────────────────

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
  // Village-specific categories (the stadium has no entries for these).
  | "wellness"
  | "hostel"
  // Stadium-specific categories (the village has no entries for these, so its
  // launcher/sidebar never shows them — categories are gated per active floor).
  // Each presents one header label + 2–3 option chips (see CategoryMeta.segmentBy
  // "option" + Destination.option), instead of a flat per-item icon list.
  | "entrance"
  | "seating"
  | "accessibility"
  | "discovery"
  // Stadium transit + IT/Security command categories.
  | "transit"
  | "cctv"
  // Village seat-view + services categories (imported from the village UI).
  | "services"
  | "seatviews"
  | "safety"
  // ── LA2028 HoloTwin demo categories (memorial / stadium). Seven top-level
  // categories from the demo feature spec; each shows one distinct panel UI with
  // sub-category chips (Destination.option). "seating" = Seat View, "services" = Nearby
  // Services, "accessibility" absorbs Safety/Emergency egress.
  | "layouts"
  | "crowdflow"
  | "eventupdates"
  | "infra"
  // ── HoloTwin LA Port zones ────────────────────────────────────────────────
  // The terminal's five operating areas. Each groups the layouts (L01-L10)
  // that sit in it; see scripts/build-scenes.cjs.
  | "waterside"
  | "yard"
  | "landside"
  | "rail"
  | "executive";

/** Dining sub-mode: campus-run dining halls vs à-la-carte restaurants. Drives
 *  the two-segment toggle in the Dining panel. */
export type DiningKind = "campus" | "restaurant";

/** A bus/train route serving a transport hub. `headwayMin` = minutes between
 *  departures (the UI derives a live "next in N min" from it); `to` = where the
 *  line heads; `seats` = seats available on the next departure (0 = Full);
 *  `mode` picks the bus vs train icon in the on-arrival timetable. */
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
  /**
   * Arrival viewpoint AND destination in one. `position` is authored as
   * [x, 0, z] — the X/Z is the navmesh destination the route ends at; the Y is
   * 0 in config and supplied at runtime from the player (navmesh + eye height).
   * `rotation` is an Euler in **YXZ** order (x=pitch, y=yaw, z=roll), as emitted
   * by /extract-pos and applied by the player — reconstruct arrival facing with
   * `camera.rotation.set(x, y, z, "YXZ")` (a level camera is [pitch, yaw, 0]).
   * Absent while a destination is not yet authored in the cameras GLB — the
   * entry still lists (keeps its sub-category tab) but has no route/teleport.
   */
  camera?: { position: [number, number, number]; rotation: [number, number, number] };
  /**
   * The annotation point — what the UI lists and the map pins. Distinct from
   * `camera`: the player walks to `camera` (facing this hotspot), but the map
   * marker + any annotation sit at `hotspot`. Many hotspots may share one
   * camera. Falls back to `camera.position` when omitted.
   */
  hotspot?: { position: [number, number, number]; label?: string };
  /**
   * MULTIPLE annotation points for one destination (e.g. every Level-2 gate,
   * all restroom locations). Each shows as a map pin AND a 3D marker circle;
   * tapping any of them routes to the shared `camera` (so the walk + the
   * distance/ETA always match the list UI). Takes precedence over `hotspot`.
   * `rotation` is the authored marker orientation (XYZ euler that turns a
   * +Z-facing disc onto the surface it marks) — extracted from the hotspot
   * GLB's oriented planes; omitted = lie flat.
   */
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
  /** Render this destination's hotspots as 3D in-scene markers too (disc +
   *  ring + hover name). Off by default — hotspots then only appear as map
   *  pins. Set per destination in scenes.json. */
  showHsIn3d?: boolean;
  /** Explicitly teleport-only, BOTH directions: no walk/route TO this spot,
   *  and while standing AT it every other destination is teleport-only too.
   *  Authored per destination (areas with no direct navmesh access — the
   *  Level 3 seat, the upper-concourse concession stand) — the automatic
   *  A* reachability guess was unreliable, so this flag is the source of
   *  truth. */
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
  /** Stadium categories (segmentBy "option") — the option chip/tab this
   *  destination belongs to, e.g. "Lower Bowl", "Main Gate", "Accessible".
   *  Destinations are grouped under their option in the panel; the category
   *  shows one header label + a tab per distinct option. */
  option?: string;
  /** Per-destination congestion (authored), drives the list badge + the
   *  fastest-entry reroute. */
  crowd?: CrowdLevel;
  /** Congestion detail shown on the badge, e.g. "Moderate · ~6 min wait". */
  crowdNote?: string;
  /** Transport hubs only — bus/train routes serving this hub (for live timings). */
  transit?: { routes: DestinationTransitRoute[] };
  /** Elevated destinations (e.g. stadium seating) sit ABOVE the navmesh. When true, the
   *  Teleport action keeps the authored camera Y (the exact seat eye height)
   *  instead of snapping down to the walkable floor below. */
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

/**
 * An external destination venue (stadium / arena) reachable from this scene via
 * a transit hub. Authored separately from the navmesh transport hubs: picking a
 * destination routes the player to its `hubId` to board the listed `lines`.
 */
export type TransportDestination = {
  id: string;
  label: string;
  /** Sport / what happens there — shown as the card's meta line. */
  sport?: string;
  /** id of the transport hub destination in this scene to catch transit at. */
  hubId: string;
  /** Lines to board at the hub for this destination. */
  lines: TransportLine[];
  /** Whether this destination is reachable right now (only the JRTC hub route
   *  is wired up for now). Non-accessible venues show greyed + non-selectable.
   *  Defaults to accessible when omitted. */
  accessible?: boolean;
};

/** destinations grouped by category label, as authored in scenes.json. */
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
  /** Floor this layout belongs to. Required when layouts live at the
   *  node-level (the new unit-wide list). Optional when authored inside a
   *  floor (legacy nested form — the floor's id is filled in implicitly). */
  floorId?: string;
};

export type FurnitureConfig = {
  modelUrl?: string;
  groups?: string[];
  textureSwaps?: Record<string, string>;
};

// A camera waypoint inside a FloorTransition. Position is FLOOR-LEVEL world
// space — cameraHeight is added by the animator at apply time, identical to
// startPosition / layouts.
export type TransitionCamera = {
  position: [number, number, number];
  rotation: [number, number, number];
};

// A clickable portal mesh inside a floor's GLB that triggers a cinematic
// camera animation across waypoints, swaps the floor model at fade-peak, then
// continues animating on the destination floor before handing control back to
// the player.
export type FloorTransition = {
  /** Mesh name inside the source floor's GLB (case-sensitive). */
  meshName: string;
  /**
   * Optional empty/locator mesh inside the source floor's GLB whose world
   * position anchors the on-screen "info" hotspot button. When set, an HTML
   * overlay button is rendered at this point with a tooltip pointing at the
   * destination floor; clicking it triggers the same transition as clicking
   * the meshName portal.
   */
  hotspotName?: string;
  /** Destination floor id (must exist in floors[]). */
  targetFloorId: string;
  /**
   * Index (into `cameras[]`) of the swap-leg destination. The model swap
   * fires AT this waypoint: the leg ending at cameras[swapAtCamera] runs in
   * parallel with the fade-in, and the swap callback fires at fade peak —
   * mid-leg when LEG_MS > FADE_IN_MS, otherwise once the camera arrives.
   * Waypoints [swapAtCamera+1 .. end] play on the destination floor.
   */
  swapAtCamera: number;
  /** Camera waypoints, in order. The current pose is the implicit start. */
  cameras: TransitionCamera[];
};

/**
 * Per-venue lighting setup. Every field is optional — anything omitted falls
 * back to the shared defaults baked into `SceneLights`. Lets each scene/venue
 * (village, stadium, hotel room, …) dial in its own sun/ambient/shadow look
 * straight from `scenes.json` without touching component code.
 */
export type LightsConfig = {
  /** Ambient fill intensity. Default 0.8. */
  ambientIntensity?: number;
  /** Ambient fill colour (hex). Default "#ffffff". */
  ambientColor?: string;
  /** HDR image-based lighting intensity. Default 0.65. */
  envIntensity?: number;
  /** Environment HDRI file (public path) used for image-based lighting +
   *  reflections. Default "/env.hdr"; interiors point at a city HDRI. */
  envFile?: string;
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
  // ── Interior spot light ───────────────────────────────────────────────────
  // A shadow-casting ceiling spot placed INSIDE the room, aimed down at the
  // floor. Used on interior venues where the directional sun is blocked by the
  // ceiling and can't cast indoor shadows. Only rendered for interior floors;
  // ignored on exteriors.
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
  /** When true, an on-screen panel is shown for this venue to tune every light
   *  value live (and copy the result back into this block). Authoring aid —
   *  leave unset/false in production. */
  controls?: boolean;
};

/** A fully-resolved lights set (every field present) — defaults merged with a
 *  venue's overrides. This is what the live controls edit and SceneLights renders. */
export type ResolvedLights = Required<Omit<LightsConfig, "controls">>;

export type FloorConfig = {
  id: string;
  label: string;
  modelUrl: string;
  navmeshUrl: string;
  boundsUrl?: string;
  floorPlanUrl?: string | null;
  /** Per-venue lighting overrides. See `LightsConfig`; omitted → shared defaults. */
  lights?: LightsConfig;
  /** Marks an apartment-interior floor (entered via a transition). Drives the
   *  stripped-down interior UI: no minimap, no scene toggle, no nav path/pin,
   *  just a round Home + Stop. */
  interior?: boolean;
  /** Whether this floor casts/receives the sun's shadow. Defaults to true.
   *  Set false (e.g. the stadium) to drop all shadow cost for that floor. */
  shadows?: boolean;
  /** Per-floor eye height (world units). Interiors are at human scale (≈1.5)
   *  while the exterior village uses a much larger value. Falls back to the
   *  node-level cameraHeight when unset. */
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  /**
   * Optional per-floor dollhouse overview camera. When set, toggling TO this
   * floor (via the scene selector) re-enters the dollhouse view seated at this
   * pose — the orbit pivots on the model's bounding-box centre and a
   * double-click flies to `startPosition`. Floors without it (e.g. the village)
   * keep the toggle's straight-to-first-person behaviour. Falls back to the
   * node-level `dollHouseCamera` when used as the initial view.
   */
  dollHouseCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  /**
   * Dollhouse-only floor: the model is shown ONLY in the orbit/dollhouse view —
   * the double-click fly-in to first-person is disabled and no first-person UI
   * is mounted. Needs a `dollHouseCamera`; `navmeshUrl` may be empty since the
   * player never walks it. Used for preview-only venues (e.g. the memorial).
   */
  dollhouseOnly?: boolean;
  /** Map "compact list" design (memorial): numbered dots on the plan tied to a
   *  destination list below it; free click-to-walk on the plan is disabled.
   *  Floors without it keep the classic labelled-hotspot map (village). */
  mapListMode?: boolean;
  /** Double-clicks that land OFF the walkable navmesh walk to the NEAREST
   *  on-mesh point instead of being rejected (memorial: its navmesh covers
   *  only the authored corridors, so strict on-mesh clicking rejects most of
   *  the visible ground). Off by default — the village/stadium keep the strict
   *  check so clicks on stands/roofs don't start unintended walks. */
  clickSnapToNav?: boolean;
  /** Route sanitation (default TRUE): A* routes are truncated at segments that
   *  leave the endpoints' height band or exceed a walkable grade — a guard for
   *  POLLUTED navmeshes (the memorial's covers the seating bowl, so shortest
   *  routes dive through the stadium). Set FALSE for venues with a clean
   *  multi-level navmesh (SoFi stadium): its legitimate ramp routes climb
   *  ~9 m between plaza and concourse, which the band check would wrongly
   *  reject — making destinations read "unreachable" in one direction. */
  routeSanitize?: boolean;
  /**
   * Optional sticker labels rendered in the minimap margin. Each entry tags
   * a world XZ point in this floor with a text label. The floor-plan PNG is
   * expected to already contain the visual point (white dot) at that XZ;
   * the runtime draws only the leader line + rectangular text label outside
   * the floor area. `angle` (deg cw from up) + `length` (canvas px) place the
   * sticker manually; omit both for auto edge-snap placement.
   */
  /**
   * Optional `lookAt: {x, z}` on a sticker turns it into a "stair" point.
   * When the user minimap-clicks within ~0.8m of the sticker's XZ, the player
   * walks there and then rotates (yaw only) to face the `lookAt` target.
   */
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
  /** 3D hotspot marker disc radius (world units) for this floor's `showHsIn3d`
   *  destinations. Default 0.2 — venues where that reads too large (the
   *  stadium's wall-mounted markers sit right at eye height) dial it down. */
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
  /** Static crowd-flow heatmap overlay. A GLB of named ribbon meshes laid over
   *  the walkable routes; each mesh is tinted green/amber/red by its congestion
   *  `level`, looked up by mesh name. Not real-time — a Google-Maps-style
   *  "where it's busy" hint. Floors without it never show the Crowd Flow toggle. */
  crowdFlow?: CrowdFlowConfig;
  /** Crowd-flow heatmap GLB (memorial): named zone meshes ("crowd-flow-001"…)
   *  laid over the venue. Shown ONLY while the Crowd Flow category is open,
   *  each mesh tinted a transparent colour by its congestion tier — red high,
   *  yellow med, blue low — via `levels` (mesh name → tier; unlisted = low).
   *  The same zone SHAPES draw as matching colour overlays on the map.
   *  `flyCamera` (optional): opening Crowd Flow lifts the player to this
   *  aerial pose (pitch-locked, like the old fly mode) so the heatmap reads at
   *  a glance; closing the panel returns to the previous spot. */
  crowdFlowGlb?: {
    url: string;
    levels: Record<string, CrowdLevel>;
    flyCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  };
};

/** Congestion tiers → colour (low=green, med=amber, high=red). */
export type CrowdLevel = "low" | "med" | "high";

/** A circular congestion zone in world XZ. One source drives every surface:
 *  the 3D route colour, the minimap route colour, the 3D area discs, and the
 *  per-destination "Heavy crowds" badge. */
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
  /** Display-GLB group name(s) that map to this node. A single string for one
   *  group, or an array when one node owns several groups (e.g. a floor whose
   *  selection spans the floor slab AND a unit mesh). */
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
  /**
   * Optional cinematic "transition" pose. When set, clicking the Interior
   * button on this node first flies the exterior camera to this pose, then
   * triggers the standard fade-and-swap into interior. Authored per unit so
   * each apartment can have its own approach shot. Omit on nodes that don't
   * need the extra fly-in.
   */
  transitionCamera?: { position: [number, number, number]; rotation: [number, number, number] };
  /** Unit-wide layouts list. Each entry MUST set `floorId` so the carousel
   *  can group/sort by floor. Replaces the legacy per-floor `layouts` array;
   *  when this is set it takes precedence over any floor-level layouts. */
  layouts?: LayoutsConfig[];
};

// ── Node registry — built once at module load ──────────────────────────────────

export const NODE_BY_ID: Record<string, NodeData> = {};
export const PARENT_OF:  Record<string, string>   = {};

function register(node: NodeData, parentId?: string) {
  NODE_BY_ID[node.id] = node;
  if (parentId) PARENT_OF[node.id] = parentId;
  node.children?.forEach(c => register(c, node.id));
}
(nodes as NodeData[]).forEach(n => register(n));

// ── Utility functions ─────────────────────────────────────────────────────────

export function canExploreInterior(node: NodeData): boolean {
  return !!(node.floors?.some(f => f.modelUrl && f.navmeshUrl));
}

export const fmt = (raw: string | string[]) => {
  // raycastName can be an array of group names — use the first as the label.
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
