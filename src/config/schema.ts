export type Vec3 = [number, number, number];

/** A camera as the runtime applies it: position + YXZ euler. */
export type CameraPose = {
  position: Vec3;
  rotation: Vec3;
};

export type LayoutCamera = {
  position: Vec3;
  rotation?: Vec3;
  /** A point to look at; the rotation is derived from it and `position`. */
  target?: Vec3;
};

export type StreamTier = {
  distance: number;
  texture: { px: number; format: "auto" | "webp" | "ktx2" };
};

export type StreamHideRule = {
  /** Exact `materials.json` name(s); the chunk must carry at least one. A list
   *  is one rule, so an object assembled from many materials stays one entry. */
  material?: string | string[];
  /** Chunk bounding-sphere radius floor, metres. */
  minRadiusMetres?: number;
  node?: string;
};

export type StreamConfig = {
  slug: string;
  assetBase?: string;
  tiers: Record<"near" | "mid" | "far", StreamTier>;
  streaming: {
    /** `tiers.far.distance` × this = the unload radius — an anti-thrash margin,
     *  not a fourth tier. */
    unloadBuffer: number;
    /** How often the whole set is re-evaluated. 10 = every 100 ms. */
    updateHz: number;
    frustumCull: boolean;
    /** Ticks out-of-view a mounted chunk is held before its GPU memory is
     *  freed. At updateHz 10, 15 = 1.5 s. Stops re-upload thrash when turning. */
    cullGraceTicks: number;
    /** Chunks this close stay loaded 360°, so looking around is instant. */
    alwaysLoadRadiusMetres: number;
    frustumMarginMetres: number;
    hysteresisMetres: number;
    loadsPerTick: number;
    /** > 0 biases big chunks to load earlier than their surface distance says. */
    radiusScale: number;
    refRadius: number;
    geometry?: "streamed" | "resident";
    /** The single LOD `"resident"` mounts. Omitted → `"near"`. */
    residentTier?: "near" | "mid" | "far";
    freeCpuArrays?: boolean;
  };
  cache: {
    limitChunks: number;
    residentBudgetMB: number;
  };
  render: {
    transmission: "off" | "near" | "all";
    progressiveTextures: boolean;
    /** Texture upgrades started per tick, nearest first — bounded only so the
     *  upgrade wave does not re-saturate the network the fill just cleared. */
    texUpgradesPerTick: number;
    /** Whether the pixel ratio follows the frame rate. Off, `maxDpr` is a fixed
     *  ceiling and nothing moves it. */
    adaptiveDpr: boolean;
    maxDpr: number;
  };
  /** Distance fog — what lets `tiers.far.distance` be small: chunks dissolve
   *  into the backdrop before the unload boundary instead of being cut off. */
  fog: {
    enabled: boolean;
    start: number | "near" | "mid" | "midfar" | "far";
    /** Normally omitted, so the fog tracks the live scene background and stays
     *  the colour of the sky it dissolves into. Set a hex only to pin it. */
    color?: string;
  };
  /** Replaces the phone profile's own far-band scale for this model. The mobile
   *  profile pulls `tiers.far.distance` in hard, and `unloadDist` and the fog
   *  far plane follow it; a model whose subject sits beyond that horizon needs
   *  its own number. Omitted = the profile's default. */
  mobileFarScale?: number;
  forceTier?: "near" | "mid" | "far";
  /** Chunks matched by any of these are never loaded — see `StreamHideRule`.
   *  Authored per view, so normally set inside `dollhouse` / `aerial`. */
  hide?: StreamHideRule[];

  pick?: StreamHideRule[];
  aerial?: {
    /** Camera height (world Y, metres) that switches the bands. Two thresholds,
     *  so a camera sitting on the line cannot flip every tick. */
    enterAboveMetres: number;
    exitBelowMetres: number;
    tiers?: Partial<Record<"near" | "mid" | "far", StreamTier>>;
    streaming?: Partial<StreamConfig["streaming"]>;
    cache?: Partial<StreamConfig["cache"]>;
    fog?: Partial<StreamConfig["fog"]>;
    render?: Partial<StreamConfig["render"]>;
  };

  dollhouse?: {
    tiers?: Partial<Record<"near" | "mid" | "far", StreamTier>>;
    streaming?: Partial<StreamConfig["streaming"]>;
    cache?: Partial<StreamConfig["cache"]>;
    fog?: Partial<StreamConfig["fog"]>;
    render?: Partial<StreamConfig["render"]>;
    forceTier?: StreamConfig["forceTier"];
    hide?: StreamHideRule[];
  };
};

export type MapConfig = {
  base?: {
    /** Bare filename, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  plan?: {
    /** Bare filename, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  zone?: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type SceneConfig = {
  meta: {
    id: string;
    label: string;
  };
  assets: {
    modelUrl: string;
    /** Only for a site with no `stream` block — a streamed site takes the
     *  navmesh the bake emitted next to its chunks. */
    navmeshUrl?: string;
    previewUrl: string;
    envFile: string;
    /** Legacy: bounds derived at runtime from the stream manifest. Prefer
     *  `map.plan`, which stores the image and its bounds together. */
    floorPlan?: string | null;
  };
  stream: StreamConfig;
  world: {
    eyeHeight: number;
    fov: number;
    shadows: boolean;
    grade?: {
      /** Multiplier, 1 = untouched. Applied before tone mapping. */
      exposure?: number;
      /** Offsets, 0 = untouched. CSS filter takes `1 + n`. */
      brightness?: number;
      contrast?: number;
      saturation?: number;
    };
  };
  cameras: {
    /** The dollhouse orbit pose — the one camera no layout owns. Where the
     *  experience starts is `site.startLayoutId`, naming an existing layout. */
    dollhouse: CameraPose;
    spawn: CameraPose;
    firstPerson?: CameraPose;
  };
  lights: {
    ambientIntensity: number;
    ambientColor: string;
    /** Sky fill (hemisphere light) — keeps the away-from-sun side off black.
     *  Omitted → 0. See `LightsConfig.hemiIntensity`. */
    hemiIntensity?: number;
    hemiSkyColor?: string;
    hemiGroundColor?: string;
    envIntensity: number;
    sunIntensity: number;
    sunColor: string;
    sunDirection: Vec3;
    shadowMapSize: number;
    shadowRadius: number;
    shadowBias: number;
    shadowNormalBias: number;
    /** Half-width of the sun's shadow square while walking. See `LightsConfig`.
     *  Omitted → 340. */
    shadowFollowExtent?: number;
  };
  globals: {
    /** The container the H09 → H14 → H24 → H30 story follows. Every field
     *  marked `ref: "hero"` is asserted equal to it at load. */
    heroContainerId: string;
  };
  map?: MapConfig;
  /** The analytic sky dome. Absent (or `mode: "off"`) keeps the flat
   *  background-colour backdrop this app shipped with. */
  sky?: SkyConfig;
};

export type SkyConfig = {
  /** `off` = the flat background colour (the previous backdrop). */
  mode: "day" | "afternoon" | "dusk" | "off";
  /** Explicit point on the day arc, 0..1, overriding the mode's default stop.
   *  0 is the sun on the horizon, 1 is high midday. */
  t?: number;
  /** Procedural cloud band along the horizon. Default true, and the only part
   *  of the shader with real per-pixel cost. */
  clouds?: boolean;
  sun?: {
    /** Compass angle, DEGREES. 0 points the sun toward −Z, positive swings +X. */
    azimuth: number;
    /** Height above the horizon, DEGREES. Clamped to 15°..85°: lower and
     *  `shadowBias` stops covering the depth error, higher casts nothing. */
    elevation: number;
  };
  lights?: Partial<
    Omit<
      SceneConfig["lights"],
      "sunDirection" | "sunColor" | "ambientColor" | "hemiSkyColor" | "hemiGroundColor"
    >
  >;
};

export interface InstructionItemCopy {
  icon: string;
  text: string;
}

/** A titled block of instruction tiles (e.g. "While walking"). */
export interface InstructionGroupCopy {
  label: string;
  items: InstructionItemCopy[];
}

export interface InstructionsCopy {
  title: string;
  subtitle?: string;
  actionLabel: string;
  /** Tiles per row on a normal viewport. Defaults to 2. */
  columns?: number;
  /** Either a flat list (short cards) or grouped blocks (the first-person
   *  card, which needs headings). Exactly one of the two is set. */
  items?: InstructionItemCopy[];
  groups?: InstructionGroupCopy[];
}

export type UiConfig = {
  /** One card per view — each teaches only the controls of that view. */
  instructions: Record<"dollhouse" | "firstPerson", InstructionsCopy>;
  panels: {
    /** Letters stacked down the edge tab. */
    hotspotsFlapLabel: string;
    securityGroupLabel?: string;
  };
  zones: Record<ZoneKey, { label: string; color: string }>;
  popup: {
    journeyTitle: string;
  };
  tones: Record<Tone, string[]>;
};

export type ZoneKey = "waterside" | "yard" | "landside" | "rail" | "executive";

export type LayoutConfig = {
  id: string;
  name: string;
  zone: ZoneKey;
  /** The handoff's Purpose line for this layout, verbatim. */
  description: string;
  position: Vec3;
  /** The viewpoint for this layout AND for every one of its hotspots. */
  camera: LayoutCamera;
  /** false = an aerial/overview pose: not a first-person entry point, and
   *  walking is disabled while standing in it. */
  walkable: boolean;
  /** Keep the authored Y instead of snapping to the navmesh (elevated views). */
  exactPose?: boolean;
  hotspots: string[];
};

/** A layout row as the site file stores it — no derived `hotspots` list. */
export type LayoutRow = Omit<LayoutConfig, "hotspots">;

export type FieldType =
  | "string"
  | "integer"
  | "decimal"
  | "percentage"
  | "enum"
  | "boolean"
  | "datetime"
  | "duration";

export type Tone = "ok" | "warn" | "alert";

export type HotspotField = {
  name: string;
  label: string;
  type: FieldType;
  value: string | number | boolean;
  unit?: string;
  tone?: Tone;
  render?: "meter";
  max?: number;
  /** Fixed decimal places — JSON drops a trailing .0, but some readings are
   *  specified at a set precision (-18.0 °C, 77.0 %). */
  decimals?: number;
  /** Required by the handoff but unsupplied by either source document.
   *  Rendered as absent, and reported by `npm run verify` until filled. */
  pending?: boolean;
  eventOnly?: boolean;
  ref?: string;
};

export type JourneyStep = {
  stage: string;
  label: string;
  state: string;
  layoutId: string;
  hotspotId: string;
};

export type DataSource = "static" | "demo" | "live";

export type HotspotIcon =
  | "vessel"
  | "container"
  | "crane"
  | "reefer"
  | "yard"
  | "equipment"
  | "gate"
  | "rail"
  | "kpi"
  | "safety"
  | "sustainability"
  | "journey"
  /** The Port Security demo layer (S01-S08), drawn only in Security Mode. */
  | "security";

export type HotspotConfig = {
  id: string;
  layoutId: string;
  name: string;
  popupTitle: string;
  icon: HotspotIcon;
  /** Where the marker itself sits in the world. */
  position: Vec3;
  /** Authored marker orientation, XYZ euler. Data only — the marker is a
   *  sphere, so nothing renders with it. */
  rotation: Vec3;
  /** This hotspot's own viewpoint — the pose travelling to it lands on.
   *  Optional; an unauthored hotspot falls back to its layout's camera. */
  camera?: LayoutCamera;
  image?: string;
  enabled?: boolean;
  animation?: {
    clip: string;
    /** Default 2. */
    delaySeconds?: number;
    repeatSeconds?: number;
  };
  geofence?: {
    url: string;
    color?: string;
  };
  poster?: {
    url: string;
    width: number;
    height: number;
  };
  /** A looping camera clip, shown at the top of the card with the field grid
   *  under it. Unlike `poster` the readings are NOT hidden: a clip shows what
   *  the camera sees and carries no panel of its own. `poster` here is the
   *  first frame, painted while the video buffers. */
  clip?: {
    url: string;
    poster?: string;
    width: number;
    height: number;
  };
  alert?: {
    level: "danger" | "caution";
    /** One word, as the banner's heading: "Danger", "Caution". */
    title: string;
    /** What is wrong, in a sentence. */
    detail?: string;
  };
  journey?: JourneyStep[];
  fields: HotspotField[];
};

export type SiteConfig = {
  meta: SceneConfig["meta"];
  /** Foreign key into `layouts` — the layout whose camera the experience opens
   *  on, and the fallback pose for anything unauthored (`startPose`). */
  startLayoutId: string;
  assets: SceneConfig["assets"];
  stream: SceneConfig["stream"];
  world: SceneConfig["world"];
  cameras: SceneConfig["cameras"];
  lights: SceneConfig["lights"];
  globals: SceneConfig["globals"];
  map?: SceneConfig["map"];
  sky?: SceneConfig["sky"];
  zones: UiConfig["zones"];
  tones: UiConfig["tones"];
  /** Everything the UI puts on screen in words. */
  copy: {
    instructions: UiConfig["instructions"];
    panels: UiConfig["panels"];
    popup: UiConfig["popup"];
  };
  layouts: LayoutRow[];
  worldModels?: string[];
  hotspots: HotspotConfig[];
  securityHotspots?: HotspotConfig[];
};

export type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson";

export type PanelKey = "map" | "layouts" | "hotspots" | null;
