export type Vec3 = [number, number, number];

/** A camera as the runtime applies it: position + YXZ euler. */
export type CameraPose = {
  position: Vec3;
  rotation: Vec3;
};

/**
 * A camera as the handoff §4 authors it: `camera_position` + `camera_target`.
 * The rotation is derived from the two — a target is what an author can point
 * at something, and it survives the model swap far better than an euler.
 */
export type LayoutCamera = {
  position: Vec3;
  target: Vec3;
};

// ── scene.json ────────────────────────────────────────────────────────────────

export type SceneConfig = {
  meta: {
    id: string;
    label: string;
    subtitle: string;
    brand: string;
    version: string;
    /** "placeholder" while we stand on the LA Olympics model. */
    modelStatus: string;
  };
  assets: {
    modelUrl: string;
    navmeshUrl: string;
    previewUrl: string;
    floorplanUrl: string;
    envFile: string;
  };
  world: {
    eyeHeight: number;
    walkSpeed: number;
    speedMultipliers: number[];
    defaultSpeedMultiplier: number;
    /**
     * How far from the player a resource marker still shows, in world units,
     * and how many of those NEARBY markers may show at once.
     *
     * The cap bounds the proximity set only — the layout the player is standing
     * at always shows all of its own resources on top, however far they are
     * framed from. The cap is the meaningful limiter of the two: a radius is
     * tied to the model's scale, and these poses move to the Everport terminal.
     */
    nearbyHotspotRadius: number;
    nearbyHotspotMax: number;
    shadows: boolean;
    background: string;
    fog: { enabled: boolean; color: string; near: number; far: number };
  };
  cameras: {
    entry: CameraPose;
    dollhouse: CameraPose;
    start: CameraPose;
  };
  lights: {
    ambientIntensity: number;
    ambientColor: string;
    envIntensity: number;
    sunIntensity: number;
    sunColor: string;
    sunDirection: Vec3;
    shadowMapSize: number;
    shadowRadius: number;
    shadowBias: number;
    shadowNormalBias: number;
  };
  globals: {
    /** The container the whole H09 -> H14 -> H24 -> H30 story follows. */
    heroContainerId: string;
    vessel: { name: string; imo: string };
    terminal: Record<string, string | number | boolean>;
    /** Canonical ids for every asset named by more than one hotspot. */
    assets: Record<string, string>;
  };
};

// ── ui.json ───────────────────────────────────────────────────────────────────

export interface InstructionsCopy {
  title: string;
  actionLabel: string;
  items: { icon: string; text: string }[];
}

export type UiConfig = {
  theme: { color: string; accent: string; background: string };
  loading: { title: string; tagline: string; brand: string };
  /** One card per view — each teaches only the controls of that view. */
  instructions: Record<"dollhouse" | "firstPerson", InstructionsCopy>;
  sidebar: Record<"map" | "layouts" | "hotspots" | "dollhouse", string>;
  panels: {
    layoutsTitle: string;
    layoutsSubtitle: string;
    hotspotsTitle: string;
    hotspotsSubtitle: string;
    mapTitle: string;
    goToTitle: string;
    /** Letters stacked down each edge tab. */
    hotspotsFlapLabel: string;
    layoutsFlapLabel: string;
  };
  /** The destination view shown before travelling. */
  travel: Record<
    | "overviewTitle" | "walkLabel" | "teleportLabel" | "reachedLabel" | "reachedHint"
    | "instantLabel" | "instantHint" | "measuringHint" | "onFoot",
    string
  >;
  zones: Record<ZoneKey, { label: string; color: string }>;
  popup: {
    demoBadge: string;
    staticBadge: string;
    liveBadge: string;
    closeLabel: string;
    journeyTitle: string;
    goToLabel: string;
    copyLabel: string;
    copiedLabel: string;
  };
  hud: {
    stopLabel: string;
    speedLabel: string;
    walkingLabel: string;
    placeholderNotice: string;
  };
  tones: Record<Tone, string[]>;
};

// ── layouts.json ──────────────────────────────────────────────────────────────

export type ZoneKey = "waterside" | "yard" | "landside" | "rail" | "executive";

export type LayoutConfig = {
  id: string;
  name: string;
  zone: ZoneKey;
  /** The handoff's Purpose line for this layout, verbatim. */
  purpose: string;
  /** Same text; kept as the field the UI reads. */
  description: string;
  position: Vec3;
  /** The viewpoint for this layout AND for every one of its hotspots. */
  camera: LayoutCamera;
  teleportEnabled: boolean;
  /** false = an aerial/overview pose. Not a valid first-person entry point,
   *  and walking is disabled while standing in it. */
  walkable: boolean;
  /** Provenance of the authored camera pose — see scripts/author-positions.cjs. */
  poseSource?: string;
  /** Keep the authored Y instead of snapping to the navmesh (elevated views). */
  exactPose?: boolean;
  hotspots: string[];
};

// ── hotspots.json ─────────────────────────────────────────────────────────────

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
  /** Fixed decimal places. JSON drops a trailing .0, but the spec prints some
   *  readings at a set precision (-18.0 °C, 77.0 %) and the precision is the
   *  point. */
  decimals?: number;
  /** The handoff requires this topic but neither source document supplies a
   *  value. Rendered as absent, and reported by `npm run verify` until filled. */
  pending?: boolean;
  /**
   * Names one of the demo's canonical identifiers — "hero" for the hero
   * container, otherwise a key of `scene.globals.assets` (crane, berth,
   * yardBlock, truck, railTrack, …).
   *
   * These are the values that TRAVEL between hotspots: the same crane appears
   * at the berth, in its own telemetry and in the executive journey. Marking
   * them makes `npm run verify` assert every mention agrees, so the demo can
   * never tell two stories about one object.
   */
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
  | "journey";

export type HotspotConfig = {
  id: string;
  layoutId: string;
  name: string;
  popupTitle: string;
  icon: HotspotIcon;
  dataSource: DataSource;
  linkedAssetId: string | null;
  /** The handoff's summary of what this popup shows, e.g.
   *  "crane ID, status, assigned vessel, ...". */
  dataFields: string;
  /** The handoff's Expected Interaction, e.g.
   *  "Click → crane asset popup; highlight crane in 3D". */
  interaction: string;
  /**
   * The marker — a hotspot is a POINT, not a viewpoint. Per handoff §4 it has
   * no camera of its own: it is seen from its parent layout's camera, which
   * every marker in that layout shares.
   */
  position: Vec3;
  /** Marker disc orientation; -PI/2 about X lies it flat on the ground. */
  rotation: Vec3;
  journey?: JourneyStep[];
  fields: HotspotField[];
};

// ── Runtime ───────────────────────────────────────────────────────────────────

export type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson";

export type PanelKey = "map" | "layouts" | "hotspots" | null;
