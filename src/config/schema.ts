export type Vec3 = [number, number, number];

export type CameraPose = {
  position: Vec3;
  rotation: Vec3;
};

export type LayoutCamera = {
  position: Vec3;
  rotation?: Vec3;
  target?: Vec3;
};

export type StreamTier = {
  distance: number;
  texture: { px: number; format: "auto" | "webp" | "ktx2" };
};

export type StreamHideRule = {
  material?: string | string[];
  minRadiusMetres?: number;
  node?: string;
};

export type StreamConfig = {
  slug: string;
  assetBase?: string;
  tiers: Record<"near" | "mid" | "far", StreamTier>;
  streaming: {
    unloadBuffer: number;
    updateHz: number;
    frustumCull: boolean;
    cullGraceTicks: number;
    alwaysLoadRadiusMetres: number;
    frustumMarginMetres: number;
    hysteresisMetres: number;
    loadsPerTick: number;
    radiusScale: number;
    refRadius: number;
    geometry?: "streamed" | "resident";
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
    texUpgradesPerTick: number;
    adaptiveDpr: boolean;
    maxDpr: number;
  };
  fog: {
    enabled: boolean;
    start: number | "near" | "mid" | "midfar" | "far";
    color?: string;
  };
  mobileFarScale?: number;
  forceTier?: "near" | "mid" | "far";
  hide?: StreamHideRule[];

  pick?: StreamHideRule[];
  aerial?: {
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
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  plan?: {
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
    navmeshUrl?: string;
    previewUrl: string;
    envFile: string;
    floorPlan?: string | null;
  };
  stream: StreamConfig;
  world: {
    eyeHeight: number;
    fov: number;
    shadows: boolean;
    toneMapping?: "neutral" | "none";
    grade?: {
      exposure?: number;
      brightness?: number;
      contrast?: number;
      saturation?: number;
    };
  };
  cameras: {
    dollhouse: CameraPose;
    spawn: CameraPose;
    firstPerson?: CameraPose;
  };
  lights: {
    ambientIntensity: number;
    ambientColor: string;
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
    shadowFollowExtent?: number;
  };
  globals: {
    heroContainerId: string;
  };
  map?: MapConfig;
  sky?: SkyConfig;
};

export type SkyConfig = {
  mode: "day" | "afternoon" | "dusk" | "off";
  t?: number;
  clouds?: boolean;
  sun?: {
    azimuth: number;
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

export interface InstructionGroupCopy {
  label: string;
  items: InstructionItemCopy[];
}

export interface InstructionsCopy {
  title: string;
  subtitle?: string;
  actionLabel: string;
  columns?: number;
  items?: InstructionItemCopy[];
  groups?: InstructionGroupCopy[];
}

export type UiConfig = {
  instructions: Record<"dollhouse" | "firstPerson", InstructionsCopy>;
  panels: {
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
  description: string;
  position: Vec3;
  camera: LayoutCamera;
  walkable: boolean;
  exactPose?: boolean;
  hotspots: string[];
};

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
  decimals?: number;
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
  | "security";

export type HotspotConfig = {
  id: string;
  layoutId: string;
  name: string;
  popupTitle: string;
  icon: HotspotIcon;
  position: Vec3;
  rotation: Vec3;
  camera?: LayoutCamera;
  mobileCamera?: LayoutCamera;
  image?: string;
  enabled?: boolean;
  animation?: {
    clip: string;
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
  clip?: {
    url: string;
    poster?: string;
    width: number;
    height: number;
  };
  alert?: {
    level: "danger" | "caution";
    title: string;
    detail?: string;
  };
  journey?: JourneyStep[];
  fields: HotspotField[];
};

export type SiteConfig = {
  meta: SceneConfig["meta"];
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
