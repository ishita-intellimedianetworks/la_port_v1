export type Vec3 = [number, number, number];

/** A camera as the runtime applies it: position + YXZ euler. */
export type CameraPose = {
  position: Vec3;
  rotation: Vec3;
};

/**
 * A layout's viewpoint, in whichever of the two forms it was authored in —
 * exactly one of `rotation` / `target` is set. `rotation` is the pose straight
 * off `/extract-pos` for the `cp_NNN` node; `target` is the handoff §4 form,
 * for a viewpoint aimed by naming what to look at. Both resolve to the same
 * `CameraPose` — see `poseForCamera` in config/index.ts.
 */
export type LayoutCamera = {
  /** Authoring note — data, not config. */
  _note?: string | string[];
  position: Vec3;
  /** Authored world rotation in **XYZ** order, as `/extract-pos` prints it —
   *  NOT the YXZ the camera is finally set with (`poseForCamera` reorders it).
   *  Paste it from the tool, do not hand-convert. */
  rotation?: Vec3;
  /** A point to look at; the rotation is derived from it and `position`. */
  target?: Vec3;
};

/** One quality band. `distance` is metres from the camera to the chunk surface
 *  at which the band starts applying. Walked near → mid → far, first match
 *  wins, so near.distance < mid.distance < far.distance must hold. */
export type StreamTier = {
  distance: number;
  texture: { px: number; format: "auto" | "webp" | "ktx2" };
};

/**
 * One "don't draw this" rule, matched against the manifest.
 *
 * Named by MATERIAL, not by mesh: the bake strips mesh names, and
 * `materials.json` is the only place a source-scene name survives. The size
 * guard is for when a material is shared with things that must stay (the
 * terminal's pavement carries the district ground plane's material).
 *
 * A chunk is hidden when every predicate the rule states matches it; a rule
 * that states none matches nothing.
 */
export type StreamHideRule = {
  _note?: string;
  /** Which source mesh this rule stands for. Documentation only. */
  _mesh?: string;
  /** Exact `materials.json` name(s); the chunk must carry at least one. A list
   *  is one rule, so an object assembled from many materials stays one entry. */
  material?: string | string[];
  /** Chunk bounding-sphere radius floor, metres. */
  minRadiusMetres?: number;
  /**
   * Exact object name in `animated.glb`, matched against that group instead of
   * the chunks. Anything that moves is lifted out of the chunk set at bake time
   * and is permanently resident — never banded, evicted or culled — so no
   * `material`/`minRadiusMetres` rule can reach it. It is also the one part of
   * the asset set that keeps its source names; naming a root hides the subtree.
   *
   * Hiding is `visible = false`, not an unload: the clip keeps running, so
   * switching back is instant and mid-animation rather than reset.
   */
  node?: string;
};

export type StreamConfig = {
  /** Which baked asset set to stream. Resolves to
   *  `${NEXT_PUBLIC_ASSET_BASE ?? "/assets"}/<slug>/assets/` unless `assetBase`
   *  names a published one outright. */
  slug: string;
  /** The complete published base for this bake, used verbatim. Set it when no
   *  root + slug can compose it — the normal case with more than one bake,
   *  since `NEXT_PUBLIC_STREAM_BASE` can only name one. Unset, resolution falls
   *  back to that variable and then to `<assetRoot>/<slug>/assets/`. */
  assetBase?: string;
  /** Authoring note for `assetBase` — data, not config. */
  _assetBaseNote?: string;
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
    /**
     * How geometry is managed. Omitted → `"streamed"`.
     *
     * `"resident"` loads every chunk once at `residentTier` and never unloads,
     * re-tiers or culls it — only texture rungs still follow distance. Right
     * whenever the whole model fits in memory, where streaming buys nothing and
     * costs chunks arriving one at a time and tier swaps mid-walk.
     */
    geometry?: "streamed" | "resident";
    /** The single LOD `"resident"` mounts. Omitted → `"near"`. */
    residentTier?: "near" | "mid" | "far";
    /** Free the JS-heap vertex arrays after GPU upload (`"resident"` only).
     *  Omitted → false: this app raycasts streamed geometry (see
     *  `streaming/bvh-raycast.ts`) and freeing nulls the array a bounds tree
     *  is built from. */
    freeCpuArrays?: boolean;
  };
  cache: {
    /** Secondary entry cap on decoded chunk groups in the JS heap. The real
     *  bound is BYTES (`streaming/memory.ts > cpuMB`) — a count cannot bound
     *  this set on its own, since chunk radii span 3.6 m to 692 m and the cache
     *  is keyed by URL (one entry per chunk per tier). */
    limitChunks: number;
    /** Hard ceiling on real DECODED resident megabytes (geometry + textures).
     *  Exceed it and the effective unload radius shrinks until it fits; 0 = off.
     *  Clamped by the per-device budget, whichever is lower — so this is the
     *  knob for what a scene needs, with the device ceiling fixed. */
    residentBudgetMB: number;
  };
  /**
   * Frame time, not looks — knobs that change how expensive a frame is without
   * changing which chunks are resident. All read live; none needs a re-bake.
   */
  render: {
    /**
     * Where three's transmission pass may run. One visible material with
     * `transmission > 0` re-renders the whole opaque scene into a buffer every
     * frame, roughly doubling draw calls. This bake's three such materials have
     * no baseColour map and `thickness: 0`, where plain alpha is
     * indistinguishable from refraction — so "off" costs nothing visible.
     *
     *   "off"  — never; transmissive materials stand in as plain alpha
     *   "near" — only where a chunk is mounted at the near tier
     *   "all"  — the original cost, palette and animated rig included
     */
    transmission: "off" | "near" | "all";
    /**
     * Mount each chunk at the smallest texture rung, then upgrade in the
     * background. Without it `mount()` awaits the tier's own images and the
     * scene assembles one mesh at a time; the 128 px set is ~0.1 MB and shared
     * between chunks, so a neighbourhood arrives together. The near tier never
     * previews — see `chunk-manager.ts > mount`.
     */
    progressiveTextures: boolean;
    /** Texture upgrades started per tick, nearest first — bounded only so the
     *  upgrade wave does not re-saturate the network the fill just cleared. */
    texUpgradesPerTick: number;
    /** Whether the pixel ratio follows the frame rate. Off, `maxDpr` is a fixed
     *  ceiling and nothing moves it. */
    adaptiveDpr: boolean;
    /** Ceiling on the canvas pixel ratio, not a promise: `AdaptiveQuality`
     *  samples frame time each second and steps down toward 0.75 when the
     *  device cannot hold ~20 fps, climbing back only with real headroom. */
    maxDpr: number;
  };
  /** Distance fog — what lets `tiers.far.distance` be small: chunks dissolve
   *  into the backdrop before the unload boundary instead of being cut off. */
  fog: {
    enabled: boolean;
    /** Where the fade begins. A band name retunes itself when the bands move
     *  ("midfar" is halfway between the mid and far edges); a number is that
     *  fraction of the fade's end, which is always just inside the unload
     *  radius. */
    start: number | "near" | "mid" | "midfar" | "far";
    /** Normally omitted, so the fog tracks the live scene background and stays
     *  the colour of the sky it dissolves into. Set a hex only to pin it. */
    color?: string;
  };
  /** Pin every chunk to one quality band, whatever the distances say — for a
   *  fixed vantage framing the whole zone everything is backdrop, so the
   *  dollhouse pins "far".
   *
   *  A pin, not a re-band: distances still decide what loads and unloads, only
   *  the mounted tier is overridden. (Authoring near/mid at 0 would look the
   *  same but let the resident-budget loop empty the overview under VRAM
   *  pressure, since it shrinks the unload radius toward `near × 1.5`.) */
  forceTier?: "near" | "mid" | "far";
  /** Chunks matched by any of these are never loaded — see `StreamHideRule`.
   *  Authored per view, so normally set inside `dollhouse` / `aerial`. */
  hide?: StreamHideRule[];

  pick?: StreamHideRule[];
  /** The second strategy over the same manifest, for elevated framing cameras.
   *  The bands above assume a person standing in the terminal; a layout camera
   *  sits 54-412 m up and up to 2.8 km out, where they frame empty sky.
   *
   *  A partial override — only differing keys appear, so a retune above carries
   *  here. Omit the block to disable the swap. */
  aerial?: {
    _note?: string | string[];
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

  /** The third strategy over the same manifest — the dollhouse overview. One
   *  fixed vantage on the whole zone, so it wants every chunk present, all at
   *  the coarsest tier, none culled; `forceTier: "far"` is what flattens it,
   *  and the bytes are what the walking view re-mounts from cache on the way in.
   *
   *  `hide` is what makes it usable: the district-scale backdrop planes are
   *  15 x 10 km each and drag the orbit pivot off the terminal.
   *
   *  Same partial-override rule as `aerial`. */
  dollhouse?: {
    _note?: string | string[];
    tiers?: Partial<Record<"near" | "mid" | "far", StreamTier>>;
    streaming?: Partial<StreamConfig["streaming"]>;
    cache?: Partial<StreamConfig["cache"]>;
    fog?: Partial<StreamConfig["fog"]>;
    render?: Partial<StreamConfig["render"]>;
    forceTier?: StreamConfig["forceTier"];
    hide?: StreamHideRule[];
  };
};

/**
 * The map. Two layers, each stored with the world rect it covers, so both are
 * placed by the same world→pixel transform and can only agree. Nothing is
 * calibrated at runtime and neither layer depends on the other's pixels.
 */
export type MapConfig = {
  _note?: string;
  /**
   * Optional context layer drawn under `plan` — the surrounding port and city.
   * Same rect convention as `plan`, and like it the image's axes must already
   * be the model's: a rect cannot express a rotation.
   *
   * Clicks, overlays and the letterbox all resolve against `plan`, so this
   * layer can be swapped or dropped without touching navigation.
   */
  base?: {
    _note?: string;
    /** Bare filename, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  /**
   * The render, letterboxed into the map canvas. `bounds` uses the FLIPPED
   * convention on both axes (minX holds the world max), which encodes the
   * top-down camera's orientation. Paste it from /admin/bounds and never
   * reorder the numbers to read "naturally" — minX < maxX mirrors the map.
   */
  plan?: {
    _note?: string;
    /** Bare filename, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  /**
   * What the map opens on and what recenter returns to. A plain world rect
   * (minX < maxX) because people author it; defaults to the plan's extent.
   * Framing only — `plan` gates clicks.
   */
  zone?: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type SceneConfig = {
  meta: {
    id: string;
    label: string;
  };
  assets: {
    /**
     * The single-GLB model — a whole-zone mesh light enough to draw in one go.
     * Unused while `stream` is present: `stream.dollhouse` covers the overview
     * with a second config over the same chunks, for about the same bytes and
     * with the decoded cache handed straight to first person. With `stream`
     * absent it is the model for both views.
     */
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
  /** The chunk streamer's parameters for this model. Present = the terminal
   *  streams instead of loading `assets.modelUrl` as one GLB. One per site
   *  document, authored in full — there is no override layer to merge. */
  stream: StreamConfig;
  world: {
    eyeHeight: number;
    /** Vertical field of view in degrees, applied to every camera in the scene:
     *  the Canvas creates its camera with it and the camera store re-asserts it
     *  on whatever camera registers. */
    fov: number;
    shadows: boolean;
    /**
     * Colour grade — the finishing pass over the rendered image. Absent, or all
     * four neutral, applies nothing and costs nothing. Two mechanisms:
     *
     *   exposure   multiplies the scene in HDR before tone mapping. A uniform
     *              in a pass three.js already runs, so it is free, and the only
     *              one with the full dynamic range in hand — highlights roll
     *              off instead of clipping. Reach for this first.
     *
     *   brightness / contrast / saturation
     *              a CSS `filter` on the canvas element, over the 8-bit sRGB
     *              image. It can band if pushed, and costs the compositor a
     *              full-screen pass, so it is omitted entirely when neutral.
     *
     * The canvas is shared by both views, so a grade applies to both, but not
     * to the HTML overlays, which are siblings of the canvas. The site file is
     * only the seed — `?debug=true` drives the live values.
     */
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
    /**
     * Where first person begins — the ground pose the walking view lands on
     * after the dollhouse fly-in. Authored rather than derived from
     * `startLayoutId` because every layout here is `walkable: false`.
     *
     * NOT on the navmesh: the point is inside the mesh's AABB but misses every
     * triangle. Landing works (Home probes the floor regardless), but walking
     * out depends on the snap finding an island — hence `firstPerson` below.
     */
    spawn: CameraPose;
    /**
     * A standpoint that IS on the navmesh — where the bottom bar's "First
     * Person" circle drops the player. Different job from `spawn`, which is the
     * composed shot the entry blackout lifts on; do not point this at it.
     *
     * Verified on-mesh against the streamed navmesh. Re-check before moving it:
     * a pose that misses the mesh makes the circle do nothing.
     */
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

/**
 * The procedural sky — a gradient, sun and horizon cloud band evaluated per
 * pixel, with no texture and no post pass. See `terminal/scene/environment/sky`.
 */
export type SkyConfig = {
  _note?: string;
  /** `off` = the flat background colour (the previous backdrop). */
  mode: "day" | "afternoon" | "dusk" | "off";
  /** Explicit point on the day arc, 0..1, overriding the mode's default stop.
   *  0 is the sun on the horizon, 1 is high midday. */
  t?: number;
  /** Procedural cloud band along the horizon. Default true, and the only part
   *  of the shader with real per-pixel cost. */
  clouds?: boolean;
  /**
   * Take the sun off the day arc and park it here. Absent, `t` decides where
   * the sun is; present, these angles do — for the dome's disk and the
   * shadow-casting light alike, so the two cannot disagree.
   *
   * Colours are unaffected either way: they stay functions of `t`. That is the
   * point — it is the only way to move the shadows without repainting the sky.
   * Dial it on the `?debug=true` panel and paste the block it prints.
   */
  sun?: {
    /** Compass angle, DEGREES. 0 points the sun toward −Z, positive swings +X. */
    azimuth: number;
    /** Height above the horizon, DEGREES. Clamped to 15°..85°: lower and
     *  `shadowBias` stops covering the depth error, higher casts nothing. */
    elevation: number;
  };
  /**
   * Lighting merged over `lights` while the sky is on, so the model is lit for
   * the time of day rather than for noon.
   *
   * Intensities only: directions and colours are derived from the same palette
   * the sky is drawn from (`lightingForT`), since a hand-picked hex beside a
   * generated sky is what drifts. How strongly to light a model is all the
   * palette cannot know.
   */
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
  /** The ids of this layout's hotspots, in table order. Derived at load from
   *  `hotspots[].layoutId` — parentage is stated once, on the child, so the
   *  two cannot drift. Not a column in the site file. */
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
  /** Names one of the demo's canonical identifiers — "hero", or a key of
   *  `scene.globals.assets`. These values travel between hotspots, so marking
   *  them lets `npm run verify` assert every mention agrees. */
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
  /** Authored marker orientation, XYZ euler. Data only — the marker is a
   *  sphere, so nothing renders with it. */
  rotation: Vec3;
  /** This hotspot's own viewpoint — the pose travelling to it lands on.
   *  Optional; an unauthored hotspot falls back to its layout's camera. */
  camera?: LayoutCamera;
  journey?: JourneyStep[];
  fields: HotspotField[];
};

/**
 * One model's config file, shaped as DB tables.
 *
 * One document per bake under `config/sites/`, picked per route, sharing
 * nothing at runtime — every key below is authored in full in each file.
 *
 * `layouts` and `hotspots` are sibling arrays joined by `hotspots[].layoutId`,
 * not a tree, so the eventual DB migration is a load rather than a rewrite. The
 * nested view the Resources panel renders is rebuilt at import.
 *
 * `SceneConfig` and `UiConfig` are views over this document, sliced out by
 * `config/index.ts` so every `scene.*` / `ui.*` reader keeps working.
 */
export type SiteConfig = {
  _note?: string;
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
  hotspots: HotspotConfig[];
};

export type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson";

export type PanelKey = "map" | "layouts" | "hotspots" | null;
