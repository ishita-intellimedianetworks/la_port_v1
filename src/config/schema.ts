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

// ── site.json › stream — the adaptive chunk streamer ──────────────────────────

/** One quality band. `distance` is metres from the camera to the chunk SURFACE
 *  at which this band starts applying; `texture` is the rung its materials
 *  sample. Bands are walked near → mid → far and the FIRST match wins, so
 *  near.distance < mid.distance < far.distance must hold. */
export type StreamTier = {
  distance: number;
  texture: { px: number; format: "auto" | "webp" | "ktx2" };
};

export type StreamConfig = {
  /** Which baked asset set to stream. Resolves to
   *  `${NEXT_PUBLIC_ASSET_BASE ?? "/assets"}/<slug>/assets/`. */
  slug: string;
  tiers: Record<"near" | "mid" | "far", StreamTier>;
  streaming: {
    /** `tiers.far.distance` × this = the unload radius. A 10% anti-thrash
     *  margin so a chunk sitting exactly on the boundary does not load/unload
     *  every tick. NOT a fourth tier. */
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
  };
  cache: {
    /** LRU ceiling on DECODED chunk groups held in the JS heap. Must exceed the
     *  peak mounted count or the LRU finds nothing evictable — and stay under
     *  the manifest's chunk count or it can never evict at all. */
    limitChunks: number;
    /** Hard ceiling on resident encoded bytes (geometry + textures). Exceed it
     *  and the effective unload radius shrinks until it fits. 0 = off. */
    residentBudgetMB: number;
  };
  /** Distance fog, which is what lets `tiers.far.distance` be small: chunks
   *  dissolve into the backdrop before the unload boundary instead of being
   *  cut off at it. Fog is the cheap substitute for loaded megabytes. */
  fog: {
    enabled: boolean;
    /** Where the fade BEGINS. A band name retunes itself when the bands move
     *  ("midfar" is halfway between the mid and far edges); a number is that
     *  fraction of the fade's end. It always ENDS just inside the unload
     *  radius, so there is nothing to keep in sync. */
    start: number | "near" | "mid" | "midfar" | "far";
    /** Normally omitted: the fog then tracks the live scene background, which
     *  is what keeps it the same colour as the sky it dissolves into while
     *  that sky is crossfading. Set a hex only to pin it. */
    color?: string;
  };
};

// ── site.json › the site record ───────────────────────────────────────────────

export type SceneConfig = {
  meta: {
    id: string;
    label: string;
  };
  assets: {
    /**
     * The single-GLB model — a whole-zone mesh light enough to draw in one go.
     *
     * With `stream` present it is the DOLLHOUSE model and nothing else: the
     * overview is a fixed vantage looking at the entire zone from the air,
     * which is the one shot adaptive streaming is bad at (the view cone covers
     * everything, so the frustum cull buys nothing and the bands only fight the
     * byte ceiling). A decimated single-draw-call mesh is simply the right
     * answer up there, and the walking view streams instead. Point this at a
     * purpose-built low-poly overview mesh to make the dollhouse cheaper — no
     * other part of the app reads it.
     *
     * With `stream` absent it is the walking model too.
     */
    modelUrl: string;
    /** Only for a site with no `stream` block. A streamed site takes the
     *  navmesh the bake emitted next to its chunks, so there is no second copy
     *  to keep in step and it follows the asset base to a CDN. */
    navmeshUrl?: string;
    previewUrl: string;
    envFile: string;
  };
  /** The adaptive chunk streamer's parameters. Present = the terminal streams
   *  instead of loading `assets.modelUrl` as one GLB. */
  stream: StreamConfig;
  world: {
    eyeHeight: number;
    /**
     * Vertical field of view in degrees, applied to EVERY camera in the scene
     * — the Canvas creates its camera with it and the camera store re-asserts
     * it on whatever camera the scene registers. The one knob for how wide the
     * view reads; lower is more telephoto, higher is more fish-eye.
     */
    fov: number;
    shadows: boolean;
  };
  cameras: {
    /**
     * The dollhouse orbit pose — the ONE camera no layout owns, which is why
     * it is the only one stored here.
     *
     * Where the experience starts is `site.startLayoutId` instead: a start pose
     * is not a camera someone authors separately, it is one of the checkpoints
     * already authored as a layout, named. `cameras.entry` used to hold a
     * byte-for-byte copy of L01's camera position for exactly that reason.
     */
    dollhouse: CameraPose;
    /**
     * Where FIRST PERSON begins — the one ground pose the walking view lands on
     * after the dollhouse fly-in.
     *
     * It is authored here rather than derived from `startLayoutId` because
     * every layout in this site is an aerial framing (`walkable: false`, which
     * schema-wise is "not a valid first-person entry point"), so there is no
     * walkable checkpoint to derive it from. Deriving it anyway put the walking
     * start at L01's camera — 381 m up and 46 m outside the navmesh in X.
     *
     * VERIFIED ON-MESH against `assets.navmeshUrl`: the point is inside a
     * navmesh triangle, surface Y 0.160.
     */
    spawn: CameraPose;
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
    /** The container the whole H09 -> H14 -> H24 -> H30 story follows. Every
     *  field marked `ref: "hero"` is asserted equal to it at load. */
    heroContainerId: string;
  };
};

// ── site.json › presentation ──────────────────────────────────────────────────

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
  /** Optional line under the title. */
  subtitle?: string;
  actionLabel: string;
  /** Tiles per row on a normal viewport. Defaults to 2. */
  columns?: number;
  /**
   * Either a flat list (short cards, e.g. the dollhouse) or grouped blocks
   * (the first-person card, which walks through every icon and bar on screen
   * and needs headings to stay readable). Exactly one of the two is set.
   */
  items?: InstructionItemCopy[];
  groups?: InstructionGroupCopy[];
}

export type UiConfig = {
  /** One card per view — each teaches only the controls of that view. */
  instructions: Record<"dollhouse" | "firstPerson", InstructionsCopy>;
  panels: {
    /** Letters stacked down the edge tab. */
    hotspotsFlapLabel: string;
  };
  zones: Record<ZoneKey, { label: string; color: string }>;
  popup: {
    journeyTitle: string;
  };
  tones: Record<Tone, string[]>;
};

// ── site.json › layouts table ─────────────────────────────────────────────────

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
  /** false = an aerial/overview pose. Not a valid first-person entry point,
   *  and walking is disabled while standing in it. */
  walkable: boolean;
  /** Keep the authored Y instead of snapping to the navmesh (elevated views). */
  exactPose?: boolean;
  /**
   * The ids of this layout's hotspots, in table order. DERIVED at load from
   * `hotspots[].layoutId` — it is not a column in `site.json`.
   *
   * Parentage is stated once, on the child, exactly as a foreign key would
   * state it. It used to be stated twice (here and on the hotspot) and the
   * load-time validator existed largely to catch the two disagreeing; a fact
   * that cannot be written twice cannot drift.
   */
  hotspots: string[];
};

/** A layout row as `site.json` stores it — no derived `hotspots` list. */
export type LayoutRow = Omit<LayoutConfig, "hotspots">;

// ── site.json › hotspots table ────────────────────────────────────────────────

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
  /** Where the marker itself sits in the world. */
  position: Vec3;
  /** Authored marker orientation, as a three XYZ euler. Data only — the bead
   *  is a sphere, so nothing renders with it. */
  rotation: Vec3;
  /**
   * This hotspot's OWN viewpoint — the pose travelling to it lands on.
   *
   * The handoff's §4 model gave a camera only to the Layout and had every
   * marker under it share that one pose. Keeping it here lets a hotspot be
   * framed on its own; set it equal to the layout's camera (as L01's pair are)
   * and the two journeys are identical.
   *
   * Optional: an unauthored hotspot falls back to its layout's camera.
   */
  camera?: LayoutCamera;
  journey?: JourneyStep[];
  fields: HotspotField[];
};

// ── site.json › the document ──────────────────────────────────────────────────

/**
 * The one config file, shaped as DB tables.
 *
 * `layouts` and `hotspots` are SIBLING arrays joined by `hotspots[].layoutId`,
 * not a tree — that is the shape a database will hand back, and keeping the
 * file in it means the eventual migration is a load, not a rewrite. The nested
 * view the Resources panel renders is rebuilt at import (see `config/index.ts`).
 *
 * `SceneConfig` and `UiConfig` are VIEWS over this document, not separate
 * files: `config/index.ts` slices them out so every existing `scene.*` /
 * `ui.*` reader keeps working untouched.
 */
export type SiteConfig = {
  /** Authoring note — data, not config. */
  _note?: string;
  meta: SceneConfig["meta"];
  /**
   * FOREIGN KEY into `layouts` — the layout whose camera the experience opens
   * on. Its pose is the Canvas camera, the first-person start, and the fallback
   * for anything not yet authored (`startPose` in config/index.ts).
   */
  startLayoutId: string;
  assets: SceneConfig["assets"];
  stream: SceneConfig["stream"];
  world: SceneConfig["world"];
  cameras: SceneConfig["cameras"];
  lights: SceneConfig["lights"];
  globals: SceneConfig["globals"];
  zones: UiConfig["zones"];
  tones: UiConfig["tones"];
  /** Everything the UI puts on screen in words. */
  copy: {
    instructions: UiConfig["instructions"];
    panels: UiConfig["panels"];
    popup: UiConfig["popup"];
  };
  layouts: LayoutRow[];
  hotspots: HotspotConfig[];
};

// ── Runtime ───────────────────────────────────────────────────────────────────

export type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson";

export type PanelKey = "map" | "layouts" | "hotspots" | null;
