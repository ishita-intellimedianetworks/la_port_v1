export type Vec3 = [number, number, number];

/** A camera as the runtime applies it: position + YXZ euler. */
export type CameraPose = {
  position: Vec3;
  rotation: Vec3;
};

/**
 * A layout's viewpoint, stored in whichever of the two forms it was AUTHORED
 * in. Exactly one of `rotation` / `target` is set.
 *
 * `rotation` — the pose as it came out of the model, straight off `/extract-pos`
 * for the `cp_NNN` node. That quaternion IS the framing the artist set, so
 * storing it means nothing the runtime does can drift from what was authored in
 * 3ds Max.
 *
 * `target` — the handoff §4 form (`camera_position` + `camera_target`), for a
 * viewpoint a person aims by naming the thing to look at rather than by
 * dialling in an angle. The rotation is derived from the two.
 *
 * Both resolve to the same `CameraPose`; see `poseForCamera` in config/index.ts.
 * A target used to be the only form, and the cp cameras were stored by
 * projecting a point onto their view ray — which round-trips exactly for these
 * ten but is a derived number standing in for an authored one, and would
 * silently drop any roll a future camera carried.
 */
export type LayoutCamera = {
  position: Vec3;
  /**
   * Authored world rotation in **XYZ** order — exactly what `/extract-pos`
   * prints for the `cp_NNN` node, and the same convention `hotspots[].rotation`
   * uses. NOT the YXZ `[pitch, yaw, roll]` the camera is finally set with:
   * `poseForCamera` reorders it. Paste it from the tool, do not hand-convert.
   */
  rotation?: Vec3;
  /** A point to look at; the rotation is derived from it and `position`. */
  target?: Vec3;
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

/**
 * One "don't draw this" rule, matched against the manifest.
 *
 * NAMED BY MATERIAL, NOT BY MESH, because the bake does not keep mesh names: a
 * chunk GLB's single node and mesh are both unnamed, and `materials.json` is
 * the only place a name from the source scene survives. So a source mesh is
 * addressed here through the material it carries, plus an optional size guard
 * for when that material is shared with things that must stay (the terminal's
 * own pavement carries the same material as the district ground plane).
 *
 * A chunk is hidden when EVERY predicate the rule states matches it. A rule
 * that states none matches nothing — an empty rule silently blanking the model
 * is not a failure mode worth having.
 */
export type StreamHideRule = {
  /** Authoring note — data, not config. */
  _note?: string;
  /** Which source mesh this rule stands for. Documentation only. */
  _mesh?: string;
  /** Exact `materials.json` name(s); the chunk must carry AT LEAST ONE of them.
   *  A list is one rule, not several: a source object assembled from a dozen
   *  untitled materials (the bridge) is one thing to the person hiding it, and
   *  splitting it into a dozen rules only makes it possible to update eleven. */
  material?: string | string[];
  /** Chunk bounding-sphere radius floor, metres. */
  minRadiusMetres?: number;
  /**
   * Exact object name in `animated.glb`, matched against that group instead of
   * against the chunks.
   *
   * THE ANIMATED GROUP IS NOT CHUNKED. Anything that moves is lifted out of the
   * chunk set at bake time — a chunk folds the node matrix into its vertices,
   * and an animation is exactly a moving node matrix — and the result is
   * PERMANENTLY RESIDENT: never banded, never evicted, never culled. So no
   * `material`/`minRadiusMetres` rule can reach it, and on this bake that is
   * precisely where the ocean now lives.
   *
   * It is matched by NAME rather than by material because it is the one part of
   * the asset set that still HAS names: chunk GLBs are stripped down to an
   * unnamed node and mesh, while `animated.glb` keeps the source hierarchy
   * intact (`holder_water`, `holder_RIG_C1`, …). Naming a scene root hides the
   * whole subtree, which is both cheaper and less brittle than naming a leaf.
   *
   * Hiding is a `visible = false`, not an unload: the geometry stays in memory
   * (it has nowhere else to be) and the clip keeps running, so switching views
   * back is instant and the ocean is mid-wave rather than reset.
   */
  node?: string;
};

export type StreamConfig = {
  /** Which baked asset set to stream. Resolves to
   *  `${NEXT_PUBLIC_ASSET_BASE ?? "/assets"}/<slug>/assets/` unless `assetBase`
   *  names a published one outright. */
  slug: string;
  /** The COMPLETE published base for this bake, used verbatim — nothing is
   *  appended. Set it when a bake is served from somewhere no root + slug can
   *  compose, which is the normal case once there is more than one bake:
   *  `NEXT_PUBLIC_STREAM_BASE` is a single global and can only name one of
   *  them. Unset, resolution falls back to that variable and then to
   *  `<assetRoot>/<slug>/assets/`. */
  assetBase?: string;
  /** Authoring note for `assetBase` — data, not config. */
  _assetBaseNote?: string;
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
    /**
     * How GEOMETRY is managed. Omitted → `"streamed"`, the original behaviour.
     *
     * `"resident"` loads every chunk ONCE at `residentTier` and never unloads,
     * re-tiers or culls it. Nothing appears or disappears after the loading
     * screen; only texture rungs still follow distance. Right whenever the
     * whole model fits in memory — streaming geometry then buys nothing and
     * costs chunks arriving one at a time and tier swaps mid-walk.
     */
    geometry?: "streamed" | "resident";
    /** The single LOD `"resident"` mounts. Omitted → `"near"`. */
    residentTier?: "near" | "mid" | "far";
    /** Free the JS-heap vertex arrays after GPU upload (`"resident"` only).
     *  Omitted → FALSE here, unlike the runtime this was ported from: this app
     *  raycasts streamed geometry (see `streaming/bvh-raycast.ts`) and freeing
     *  nulls the very array the bounds tree is built from. */
    freeCpuArrays?: boolean;
  };
  cache: {
    /** SECONDARY cap on the number of decoded chunk groups in the JS heap. The
     *  cache is bounded by BYTES (`streaming/memory.ts > cpuMB`); this is only
     *  an additional entry ceiling, kept so an authored number is never
     *  silently ignored. A count cannot bound this set on its own — chunk radii
     *  span 3.6 m to 692 m, and the cache is keyed by URL, so the manifest's
     *  816 chunks are 2,448 possible entries (one per chunk per tier). */
    limitChunks: number;
    /** Hard ceiling on REAL DECODED resident megabytes (geometry + textures).
     *  Exceed it and the effective unload radius shrinks until it fits. 0 = off.
     *
     *  Clamped by the per-device budget — whichever is lower wins — so this is
     *  the knob for what a SCENE needs (the aerial view legitimately holds the
     *  whole model at the far tier) while the device ceiling stays fixed.
     *
     *  Until this was corrected it counted the manifest's ENCODED sizes, which
     *  on this bake are 13.5x smaller than what is actually held. */
    residentBudgetMB: number;
  };
  /**
   * FRAME TIME, not looks. Four knobs that change how expensive a frame is
   * without changing which chunks are resident, all read live by the browser —
   * none of them needs a re-bake, and none of them moves a distance band.
   */
  render: {
    /**
     * Where three's transmission pass may run.
     *
     * ONE visible material with `transmission > 0` makes three re-render the
     * whole opaque scene into a buffer EVERY FRAME, so draw calls roughly
     * double. This bake carries three such materials (M_Invisible.002,
     * _Translucent_Glass_Blue_1, Translucent_Glass_Blue) across 66 of its 641
     * chunks, so the pass was on in nearly every view. All three have no
     * baseColour map and `thickness: 0`, which is exactly when plain alpha is
     * indistinguishable from real refraction — so "off" costs nothing visible
     * and removes a full extra scene render.
     *
     *   "off"  — never; transmissive materials stand in as plain alpha
     *   "near" — only where a chunk is mounted at the near tier
     *   "all"  — the original cost, including the always-resident palette and
     *            the animated rig
     */
    transmission: "off" | "near" | "all";
    /**
     * Mount each chunk at the SMALLEST texture rung, then upgrade to its tier's
     * rung in the background.
     *
     * Without it `mount()` awaits the tier's own images, so a chunk cannot
     * appear until its own textures land and the scene visibly assembles itself
     * one mesh at a time. The whole image set is ~0.1 MB at 128 px and is
     * SHARED between chunks, so the preview is nearly always a cache hit and a
     * neighbourhood arrives together. The near tier never previews — see
     * `chunk-manager.ts > mount`.
     */
    progressiveTextures: boolean;
    /** Texture upgrades started per streaming tick, nearest chunk first.
     *  Bounded only so the upgrade wave does not re-saturate the network the
     *  fill has just cleared. At 4 and updateHz 10, a viewpoint that mounts
     *  ~150 chunks left them at the preview rung for nearly 4 seconds. */
    texUpgradesPerTick: number;
    /** Whether the pixel ratio FOLLOWS the frame rate. Off, `maxDpr` is simply
     *  a fixed ceiling and nothing moves it — which is what `/` did before
     *  `AdaptiveQuality` existed, and is why the flag is separate from the
     *  ceiling rather than folded into it. */
    adaptiveDpr: boolean;
    /** CEILING on the canvas pixel ratio, not a promise: `AdaptiveQuality`
     *  samples frame time each second and steps down toward 0.75 when the
     *  device cannot hold ~20 fps, climbing back only with real headroom.
     *  Resolution is the cheapest thing to give up — dropping geometry costs
     *  whole buildings. */
    maxDpr: number;
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
  /** Pin every chunk to ONE quality band, whatever the distance bands say.
   *
   *  For a fixed vantage that frames the whole zone there is no near and no
   *  far — everything is the backdrop — so the dollhouse pins "far" and draws
   *  the model at its coarsest LOD and smallest texture rung throughout.
   *
   *  It is a pin, not a re-band: the distances still decide what LOADS and what
   *  unloads, only the tier the winner mounts at is overridden. Authoring
   *  near/mid at 0 would have had the same visible effect and one invisible
   *  one — the resident-budget loop shrinks the effective unload radius toward
   *  `near × 1.5`, so with near at 0 a device that runs short of VRAM empties
   *  the whole overview instead of thinning it. */
  forceTier?: "near" | "mid" | "far";
  /** Chunks matched by any of these are never loaded — see `StreamHideRule`.
   *  Authored per VIEW (the dollhouse hides the backdrop planes the walking
   *  view stands on), so it is normally set inside `dollhouse` / `aerial`
   *  rather than here. */
  hide?: StreamHideRule[];
  /** THE SECOND STRATEGY over the same manifest, for elevated framing cameras
   *  (every `layouts[].camera` authored `walkable: false`).
   *
   *  The bands above are tuned for a person standing in the terminal, where
   *  everything that matters is within a few hundred metres. A layout camera
   *  sits 54-412 m up and as much as 2.8 km from the terminal, so under those
   *  bands the whole zone falls outside the unload radius and the shot frames
   *  empty sky. This block is what such a camera streams with instead.
   *
   *  Authored as a PARTIAL override: only the keys that differ appear and the
   *  rest is inherited from the ground config, so a retune above carries here
   *  automatically. Omit the whole block to disable the swap entirely. */
  aerial?: {
    _note?: string | string[];
    /** Camera height (world Y, metres) at or above which the aerial bands take
     *  over, and below which the ground bands come back. TWO thresholds, not
     *  one, so a camera sitting exactly on the line cannot flip every tick. */
    enterAboveMetres: number;
    exitBelowMetres: number;
    tiers?: Partial<Record<"near" | "mid" | "far", StreamTier>>;
    streaming?: Partial<StreamConfig["streaming"]>;
    cache?: Partial<StreamConfig["cache"]>;
    fog?: Partial<StreamConfig["fog"]>;
    render?: Partial<StreamConfig["render"]>;
  };

  /** THE THIRD STRATEGY over the same manifest — the DOLLHOUSE overview.
   *
   *  The overview is one fixed vantage that frames the entire zone, so it wants
   *  the opposite of what the walking bands give: every chunk present, all of
   *  them at the coarsest tier, none of them culled. `forceTier: "far"` is what
   *  flattens it — the lowest geometry LOD and the 128 px rung, the cheapest
   *  complete picture this asset set can produce — and the bytes are exactly
   *  the ones the walking view then re-mounts from cache on the way in.
   *
   *  `hide` is what makes it usable: the two district-scale backdrop planes
   *  (the ocean and the ground) are 15 x 10 km each, so from up here they are
   *  the whole frame and they drag the orbit pivot off the terminal.
   *
   *  Same partial-override rule as `aerial`. Omit the block and the dollhouse
   *  falls back to whichever config the camera's height selects. */
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
 * A SECOND BAKE, served at its own route beside the first.
 *
 * `stream` is the whole contract for one asset set. This is a PARTIAL OVERRIDE
 * of it: only the keys that differ are authored, and everything unnamed tracks
 * the base block, so a retune there carries across on its own.
 *
 * WHY AN OVERRIDE AND NOT A SECOND FULL BLOCK. Two bakes of the same zone agree
 * about almost everything that matters here — the bands, the cache ceilings,
 * the fog, the aerial strategy are properties of the ZONE and the camera, not
 * of how the geometry was cut. What genuinely differs is the manifest they
 * point at (hence `slug` + `assetBase`) and anything that NAMES something
 * inside it, which in practice is only the dollhouse's `hide` list. Duplicating
 * the rest would mean two copies drifting apart silently.
 *
 * `aerial` and `dollhouse` merge KEY BY KEY over the base's, so an override can
 * replace just `hide` and leave the tiers, the pin and the notes alone.
 * `render` and `streaming` merge the same way. `tiers` merges per band.
 */
export type StreamVariantConfig = {
  _note?: string | string[];
  /** REQUIRED: a variant that streams the same manifest is not a variant. */
  slug: string;
  assetBase?: string;
  _assetBaseNote?: string;
  tiers?: Partial<Record<"near" | "mid" | "far", StreamTier>>;
  streaming?: Partial<StreamConfig["streaming"]> & { _note?: string | string[] };
  cache?: Partial<StreamConfig["cache"]>;
  fog?: Partial<StreamConfig["fog"]>;
  render?: Partial<StreamConfig["render"]> & { _note?: string | string[] };
  forceTier?: StreamConfig["forceTier"];
  hide?: StreamHideRule[];
  /** Merged key by key over `stream.aerial` / `stream.dollhouse`. */
  aerial?: Partial<NonNullable<StreamConfig["aerial"]>>;
  dollhouse?: Partial<NonNullable<StreamConfig["dollhouse"]>>;
};

/**
 * The map. TWO layers, each stored WITH the world rect it covers, so both are
 * placed by the same world->pixel transform and can only ever agree: `base` is
 * optional context under `plan`, and `plan` alone still works exactly as it did.
 * Nothing is calibrated at runtime and neither layer depends on the other's
 * pixels — only on its own rect being right.
 */
export type MapConfig = {
  /** Authoring note — data, not config. */
  _note?: string;
  /**
   * OPTIONAL context layer, drawn UNDER `plan` — the surrounding port and city,
   * so the terminal reads as a place rather than a shape on glass. Same rect
   * convention as `plan` and, like it, must be an image whose axes are already
   * the model's: a rect cannot express a rotation, so any turn between the
   * source and the model has to be baked into the exported image.
   *
   * It defines nothing else. Clicks, overlays and the letterbox are all
   * resolved against `plan`, so this layer can be swapped, re-framed or dropped
   * without touching navigation.
   */
  base?: {
    /** Authoring note — data, not config. */
    _note?: string;
    /** BARE FILENAME, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  /**
   * The render, letterboxed into the map canvas. `bounds` uses the FLIPPED
   * convention on BOTH axes (minX holds the world MAX, minZ the world MAX),
   * which is what encodes a top-down camera's orientation; paste it from
   * /admin/bounds rather than hand-writing it, and never reorder the numbers to
   * read "naturally" — minX < maxX here mirrors the map east-west.
   */
  plan?: {
    /** Authoring note — data, not config. */
    _note?: string;
    /** BARE FILENAME, resolved against NEXT_PUBLIC_FLOORPLAN_BASE (default
     *  `/floorplan`). An absolute URL is honoured verbatim. */
    imageUrl: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
  /**
   * What the map OPENS on and what the recenter button returns to: the part
   * worth looking at, rather than the whole of `plan`. A PLAIN world rect
   * (minX < maxX) because people author it; defaults to the plan's own extent.
   *
   * Framing only. It does not gate clicks — `plan` does that — so getting it
   * slightly wrong costs a little framing and nothing else. Zooming out from
   * here is what reveals `base`.
   */
  zone?: { minX: number; maxX: number; minZ: number; maxZ: number };
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
     * UNUSED while `stream` is present. It was the dollhouse model: the
     * overview is a fixed vantage on the entire zone, the one shot adaptive
     * banding is bad at, so it drew a decimated GLB while the walking view
     * streamed. `stream.dollhouse` answers that with a second CONFIG over the
     * same chunks instead — every chunk on the far tier — which costs about the
     * same bytes and hands them straight to first person through the decoded
     * cache, so the second asset stopped earning its place.
     *
     * With `stream` absent it is the model for both views.
     */
    modelUrl: string;
    /** Only for a site with no `stream` block. A streamed site takes the
     *  navmesh the bake emitted next to its chunks, so there is no second copy
     *  to keep in step and it follows the asset base to a CDN. */
    navmeshUrl?: string;
    previewUrl: string;
    envFile: string;
    /** LEGACY: bounds derived at runtime from the stream manifest. Prefer
     *  `map.plan`, which stores the image and its bounds together. */
    floorPlan?: string | null;
  };
  /** The adaptive chunk streamer's parameters. Present = the terminal streams
   *  instead of loading `assets.modelUrl` as one GLB. */
  stream: StreamConfig;
  /** A SECOND bake of the same zone, served at `/v2`, authored as a partial
   *  override of `stream`. Absent, that route resolves to the same thing `/`
   *  does. See `StreamVariantConfig`. */
  streamV2?: StreamVariantConfig;
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
    /**
     * Colour grade — the finishing pass over the rendered image. Absent, or all
     * four at their neutral values, means NOTHING is applied and nothing costs
     * anything (see below for why that matters).
     *
     * Two different mechanisms, deliberately:
     *
     *   exposure   multiplies the scene in HDR BEFORE tone mapping
     *              (`renderer.toneMappingExposure`). It is a uniform inside a
     *              step three.js already runs, so it is free, and it is the
     *              only one of the four with the full dynamic range still in
     *              hand — highlights roll off instead of clipping. Reach for
     *              this FIRST when the scene is simply too dark or too hot.
     *
     *   brightness / contrast / saturation
     *              a CSS `filter` on the canvas element, exactly as the
     *              facet_4 study does it. That runs on the 8-bit sRGB image
     *              after tone mapping, so it can band if pushed hard, and it
     *              costs the compositor a full-screen pass every frame — which
     *              is why the filter is omitted entirely when all three are 0
     *              rather than emitted as a no-op `brightness(1)`.
     *
     * The canvas is shared by the dollhouse and the walking view, so a grade
     * here applies to both. It does NOT touch the HTML overlays: the glass UI
     * and the hotspot tooltips are siblings of the canvas, not children.
     *
     * `site.json` is only the seed — the `?debug=true` panel drives the live
     * values, same arrangement as the sky slider.
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
     * NOT ON THE NAVMESH — this comment claimed the opposite until it was
     * re-checked against the v5 navmesh: the point is inside the mesh's AABB
     * but misses all 3,950 triangles, the nearest vertex being 95.3 m away.
     * Landing here works (Home probes the floor and teleports regardless), but
     * WALKING out of it depends on the snap finding an island, which is why
     * `firstPerson` below exists.
     */
    spawn: CameraPose;
    /**
     * A standpoint that IS on the navmesh — what the bottom bar's "First
     * Person" circle drops the player at.
     *
     * It exists because `spawn` above does not satisfy that, and the two are
     * different jobs: `spawn` is the composed shot the entry blackout lifts on
     * and the one Home returns to, while this is simply somewhere the player
     * can walk from. Do not merge them by pointing this at `spawn` — that is
     * the state this replaced.
     *
     * VERIFIED ON-MESH against the streamed navmesh (v5, 3,950 triangles): the
     * XZ is inside a triangle, surface Y 0.153, nearest vertex 0.9 m. Re-check
     * that before moving it — a pose that misses the mesh makes this circle do
     * nothing a player can act on.
     */
    firstPerson?: CameraPose;
  };
  lights: {
    ambientIntensity: number;
    ambientColor: string;
    /** Sky fill (hemisphere light) — what keeps the away-from-sun side off
     *  black. Omitted → 0. See `LightsConfig.hemiIntensity` for why ambient is
     *  not the knob for this. */
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
    /** The container the whole H09 -> H14 -> H24 -> H30 story follows. Every
     *  field marked `ref: "hero"` is asserted equal to it at load. */
    heroContainerId: string;
  };
  map?: MapConfig;
  /** The analytic sky dome. Absent (or `mode: "off"`) keeps the flat
   *  background-colour backdrop this app shipped with. */
  sky?: SkyConfig;
};

/**
 * The procedural sky, ported from the `open-sea` shader study — a gradient +
 * sun + horizon cloud band evaluated per pixel, with no texture and no post
 * pass. See `terminal/scene/environment/sky`.
 */
export type SkyConfig = {
  /** Authoring note — data, not config. */
  _note?: string;
  /** `off` = the flat background colour (the previous backdrop). */
  mode: "day" | "afternoon" | "dusk" | "off";
  /** Explicit point on the day arc, 0..1, overriding the mode's default stop.
   *  0 is the sun on the horizon, 1 is high midday. */
  t?: number;
  /** Procedural cloud band along the horizon. Default true; the only part of
   *  the shader with a real per-pixel cost, so turn it off to make the sky
   *  nearly free. */
  clouds?: boolean;
  /**
   * Take the sun OFF the day arc and park it here.
   *
   * Absent (the norm) `t` decides where the sun is, as it decides everything
   * else. Present, these two angles do instead — for the disk drawn in the dome
   * AND for the shadow-casting directional light, which read one answer and so
   * cannot disagree.
   *
   * COLOURS ARE UNAFFECTED either way: every stop, the sun tint and the ambient
   * pair are still functions of the elevation `t` gives, never of this. That is
   * the point of the field — it is the only way to move the shadows across the
   * terminal without also repainting the sky, which raising `t` would do.
   *
   * Dial it on the `?debug=true` panel and paste the block it prints.
   */
  sun?: {
    /** Compass angle, DEGREES. 0 points the sun toward −Z, positive swings +X. */
    azimuth: number;
    /** Height above the horizon, DEGREES. Clamped to 15°..85°: under ~15° the
     *  shadow map's depth error stops being coverable by `shadowBias` and acne
     *  takes over, and straight overhead casts nothing you can see. */
    elevation: number;
  };
  /**
   * Lighting merged OVER `lights` while the sky is on, so the model is lit for
   * the time of day rather than for noon.
   *
   * INTENSITIES ONLY. `sunDirection`, `sunColor`, `ambientColor` and the
   * `hemi*Color` pair are derived
   * from the same palette the sky itself is drawn from (`lightingForT`) — a
   * hand-picked hex beside a generated sky is the pair that drifts apart. What
   * the palette cannot know is how STRONGLY to light a model, since the study
   * it came from is a shader with no scene lights at all; that is what this is.
   */
  lights?: Partial<
    Omit<
      SceneConfig["lights"],
      "sunDirection" | "sunColor" | "ambientColor" | "hemiSkyColor" | "hemiGroundColor"
    >
  >;
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
  streamV2: SceneConfig["streamV2"];
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

// ── Runtime ───────────────────────────────────────────────────────────────────

export type Phase = "loading" | "instructions" | "dollhouse" | "firstPerson";

export type PanelKey = "map" | "layouts" | "hotspots" | null;
