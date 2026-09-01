import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { InstanceLayer } from "./instance-layer";
import { MeshoptDecoder } from "meshoptimizer";
import { TIER_ORDER, type Tier, type TexFormat, type StreamingConfig } from "./config";
import type { Manifest, ChunkEntry, MaterialDef, TexManifest, TexSlot } from "./types";
import { dropBoundsTree, lazyBvhRaycast } from "./bvh-raycast";
import { geometryBytes, textureBytes, resolveBudget, currentGpuScale, type MemoryBudget } from "./memory";

interface ChunkState {
  entry: ChunkEntry;
  current: Tier | null; // tier currently mounted in the scene, or null
  group: THREE.Group | null; // mounted object
  loadingTier: Tier | null; // a load in flight
  textured: boolean; // whether the mounted material currently has textures
  outTicks: number; // consecutive ticks spent out of view (unload grace, anti-thrash)
  /** Refcount owner token for the textures the CURRENTLY VISIBLE materials use.
   *  Each mount/retexture acquires under a FRESH token and only releases the old
   *  one after the swap — otherwise releasing first drops the refcount to zero
   *  and disposes textures that the on-screen mesh is still drawing with, which
   *  renders it white. */
  texOwner: string | null;
  /** True while retexture() has a load in flight, so the update tick doesn't
   *  stack duplicate passes over the same group. */
  retexturing?: boolean;
  /** The rung the materials on screen were dressed at, or null when untextured.
   *  Progressive mounting dresses a chunk at the smallest rung and promotes it
   *  later, so "is this chunk textured" stopped being a boolean question. */
  texPx: number | null;
}

/** The px passed to pickTex to mean "the smallest rung this image has". pickTex
 *  clamps a request down to the largest rung <= px and falls back to the
 *  smallest when nothing qualifies, so 1 always resolves to the smallest. */
const PREVIEW_PX = 1;

// Debug: colors for the per-chunk bounding-sphere gizmos, by current tier.
const TIER_COLOR: Record<Tier, number> = { near: 0x39d353, mid: 0xe3b341, far: 0xf0883e };

/** A cheap "sphere" gizmo: three orthogonal circles of the given radius. */
function sphereGizmo(center: [number, number, number], radius: number): THREE.LineSegments {
  const seg = 40;
  const pts: number[] = [];
  const push = (x: number, y: number, z: number) => pts.push(x, y, z);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const b = ((i + 1) / seg) * Math.PI * 2;
    const ca = Math.cos(a) * radius, sa = Math.sin(a) * radius;
    const cb = Math.cos(b) * radius, sb = Math.sin(b) * radius;
    push(ca, sa, 0); push(cb, sb, 0); // XY
    push(ca, 0, sa); push(cb, 0, sb); // XZ
    push(0, ca, sa); push(0, cb, sb); // YZ
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, depthTest: false });
  const line = new THREE.LineSegments(geo, mat);
  line.position.set(center[0], center[1], center[2]);
  line.renderOrder = 1450;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

/**
 * The UV set a slot samples, clamped to one three can compile.
 *
 * three turns `texture.channel` straight into an attribute name (0 -> `uv`,
 * n -> `uv{n}`), so an out-of-range value reaches the shader verbatim: this
 * bake ships three slots with `uv: -1` (M_Rail_Ballast, M_Metal.001) and one
 * with `uv: 3` (M_Road_Arterial_Baked_C5), and `-1` compiles to `vec3(uv-1, 1)`
 * — a vec2 minus an int, which fails to link and drops every material sharing
 * that program. The chunks only ever carry TEXCOORD_0/1, so anything outside
 * that is a bake artefact and 0 is the honest reading of it.
 */
function uvChannel(slot?: TexSlot): number {
  const uv = slot?.uv ?? 0;
  return uv === 1 ? 1 : 0;
}

export interface StreamStats {
  visible: number; // chunks mounted
  loading: number;
  tris: number;
  /** CPU cache: DECODED heap bytes of every group held (mounted ones included —
   *  three keeps their typed arrays after upload). Was the encoded size. */
  cacheBytes: number;
  cacheCount: number; // number of decoded chunk groups held in the CPU cache
  residentBytes: number; // GPU: geometry currently mounted + textures currently uploaded
  texCount: number; // gpu-resident textures
  /** Decoded texture bytes resident, and how many of those are idle (zero refs,
   *  kept against a walk-back rather than disposed). */
  texBytes: number;
  texIdle: number;
  /** The three ceilings in force, MB — so the HUD can show headroom, not just
   *  a number with nothing to compare it to. */
  budgetMB: { cpu: number; gpu: number; tex: number };
  /** Churn since mount. `redownloads` counts chunk urls decoded, evicted, then
   *  fetched again — the figure that says whether cpuMB is set too low. */
  evictedChunks: number;
  evictedTextures: number;
  redownloads: number;
  /** Learned decoded/encoded ratio. Seeded at this bake's measured 13.5. */
  decodeRatio: number;
  /** True only when textures are ACTUALLY streaming as GPU-compressed KTX2 —
   *  i.e. the transcoder loaded AND at least one tier asks for it. It used to
   *  report merely that the loader existed, so the HUD read "KTX2" while every
   *  request on the wire was a .webp. */
  ktx2Active: boolean;
  byTier: Record<Tier, number>;
}

export class ChunkManager {
  private scene: THREE.Scene;
  private assetBase: string;
  private manifest: Manifest;
  private materials: MaterialDef[];
  private tex: TexManifest;
  private loader: GLTFLoader;
  private cfg: StreamingConfig;

  private states = new Map<string, ChunkState>();
  private cpuCache = new Map<string, THREE.Group>(); // url -> parsed group (decoded once)
  /** url -> DECODED heap bytes of that group, measured off the geometry once at
   *  parse time. Was the manifest's encoded size, which is ~13.5x smaller on
   *  this bake and made every ceiling in this file unenforceable. */
  private cpuBytes = new Map<string, number>();
  private texCache = new Map<string, THREE.Texture>(); // `${img}@${px}` -> texture
  private texLoading = new Map<string, Promise<THREE.Texture | null>>(); // one in-flight load per texture key
  private texRefs = new Map<string, Set<string>>(); // texKey -> set of owner tokens using it
  /** owner token -> the texture keys it holds. The reverse index of `texRefs`,
   *  so releasing one mount costs the keys IT touched rather than a walk of
   *  every key in the cache on every unmount. */
  private texOwned = new Map<string, Set<string>>();
  /** texKey -> DECODED byte size, measured off the texture (block-compressed
   *  mips for KTX2, RGBA8 + mip chain for WebP). Was the encoded file size. */
  private texBytes = new Map<string, number>();
  /** Textures nobody references right now, least-recently-idled first. They are
   *  KEPT, not disposed: 69 images serve 816 chunks, and the rung is part of the
   *  cache key, so the near-rung set drops to zero refs every time you walk 50 m
   *  and was being re-fetched and re-decoded on the way back. Eviction happens
   *  when the texture budget is actually exceeded, not when a refcount hits 0. */
  private texIdle = new Map<string, true>();
  private texSeq = 0; // monotonic token source for per-mount texture ownership
  /** Real-byte ceilings for the three pools. See `memory.ts`. */
  private budget: MemoryBudget;
  /** Churn counters, surfaced through stats() so the HUD reports eviction and
   *  re-download rates instead of leaving them to be reasoned about. */
  private evictedChunks = 0;
  private evictedTextures = 0;
  private redownloads = 0;
  private everCached = new Set<string>(); // urls decoded at least once this session
  private ktx2: KTX2Loader | null = null; // set when the GPU can transcode KTX2/Basis
  /** Shared-geometry layer. Null until initInstancing() finds a palette, and null
   *  forever for models baked without one — so this whole path stays inert for
   *  the existing bakes. */
  private instances: InstanceLayer | null = null;
  /** Chunks whose placements should be drawn this tick. Tracked separately from
   *  the mounted set because a FULLY instanced chunk has no GLB to mount: it
   *  resolves to tier null and would drop out of residency entirely. */
  private instResident: ChunkEntry[] = [];
  /** Animated subtrees (the crane rigs). Always resident — together they are a
   *  fraction of a percent of the model, and they cannot be chunked at all: a
   *  chunk bakes the node matrix into its vertices, and an animation is exactly
   *  a moving node matrix. */
  private animGroup: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;

  private _cam = new THREE.Vector3();
  private _frustum = new THREE.Frustum();
  private _projView = new THREE.Matrix4();
  private _camInv = new THREE.Matrix4();
  private _sphere = new THREE.Sphere();

  // Debug bounding-sphere gizmos (one per chunk), colored by current tier.
  private boundsGroup = new THREE.Group();
  private gizmos = new Map<string, THREE.LineSegments>();
  private boundsOn = false;

  /** Chunk ids the current config hides — resolved from `cfg.hide` against the
   *  manifest and `materials.json`, and re-resolved on every `setConfig` since
   *  the rules are authored per VIEW. A hidden chunk is decided as "unload" in
   *  `update()`, so it never downloads and an already-mounted one is dropped on
   *  the next tick. */
  private hidden = new Set<string>();

  /** Object names in `animated.glb` the current config hides, and the objects
   *  that were actually switched off for them. The animated group is
   *  permanently resident, so hiding is a `visible = false` rather than an
   *  unload — see `StreamHideRule.node`. */
  private hiddenNodes = new Set<string>();
  private hiddenAnimated: THREE.Object3D[] = [];

  /**
   * Chunks that have finished decoding and dressing but are NOT yet in the
   * scene.
   *
   * Adding each one the moment its own decode returns is what makes a fill read
   * as assembly rather than as arrival: decode time tracks chunk size and this
   * bake's chunks span two orders of magnitude, so a batch requested together
   * lands scattered over seconds, essentially in size order — which is no order
   * at all to the eye. Holding them and flushing on the streaming tick turns
   * that into a few coherent waves, and because the flush is sorted by distance
   * each wave fills outward from the camera.
   */
  private pendingReveal: {
    st: ChunkState;
    group: THREE.Group;
    tier: Tier;
    owner: string;
    textured: boolean;
    px: number;
    /** When it was queued, for the stall guard in flushReveals. */
    at: number;
  }[] = [];

  /**
   * Consecutive failed mounts per chunk id, and the ceiling that stops one dead
   * URL costing the frame.
   *
   * Only "resident" reads them, because only it re-scans for missing chunks
   * every tick instead of consuming a queue: a chunk whose load throws is
   * otherwise picked up again immediately, forever, and a manifest entry whose
   * file is genuinely gone would spin the loader for the whole session.
   */
  private mountFails = new Map<string, number>();
  private static readonly MAX_MOUNT_FAILS = 3;

  /** "resident" only: the instance buffers are built once and never again. */
  private instSynced = false;

  private mode: "adaptive" | "full";
  /** Set by dispose(). Async work started before it (the instance palette, the
   *  animated rig, an in-flight chunk) must not attach anything afterwards. */
  private disposed = false;
  /** Effective unload radius. Starts at cfg.unloadDist and is pulled in/out by
   *  the residentBudgetMB feedback loop so memory stays under the ceiling. */
  private effUnload = Infinity;

  constructor(opts: {
    scene: THREE.Scene;
    assetBase: string;
    manifest: Manifest;
    materials: MaterialDef[];
    tex: TexManifest;
    dracoPath?: string;
    mode?: "adaptive" | "full";
    /** Required: it comes from `site.json > stream` via resolveStreamConfig().
     *  There is deliberately no built-in fallback — a default here would be a
     *  second, silent source of tuning. */
    config: StreamingConfig;
    renderer?: THREE.WebGLRenderer;
    ktx2Path?: string;
    /** Real-byte ceilings. Omitted, they are resolved for this device — see
     *  `memory.ts > resolveBudget`. Deliberately NOT part of StreamingConfig:
     *  the bands are authored per SCENE in site.json, while these are a property
     *  of the DEVICE, and the aerial/ground swap must not move them. */
    budget?: MemoryBudget;
    profile?: "mobile" | "desktop";
  }) {
    this.scene = opts.scene;
    this.assetBase = opts.assetBase.replace(/\/$/, "") + "/";
    this.manifest = opts.manifest;
    this.materials = opts.materials;
    this.tex = opts.tex;
    this.mode = opts.mode ?? "adaptive";
    this.cfg = opts.config;
    this.effUnload = this.cfg.unloadDist;
    this.budget = opts.budget ?? resolveBudget(opts.profile ?? "desktop", opts.renderer);

    const draco = new DRACOLoader();
    draco.setDecoderPath(opts.dracoPath ?? "/draco/");
    // Decode WIDER. three's default pool is 4 workers, and on a Draco-compressed
    // chunk set that is the throughput ceiling on the whole fill: decoding is
    // what stands between asking for a chunk and being able to show it, and
    // `loadsPerTick` cannot raise a number the decoder is already the bottleneck
    // for. One core is left for the main thread's own work, which is why this is
    // hardwareConcurrency MINUS one rather than all of it.
    draco.setWorkerLimit(
      Math.max(4, Math.min(12, (typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4) - 1)),
    );
    draco.preload();
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);
    // Chunk tiers may be Draco OR meshopt (EXT_meshopt_compression) — the codec
    // is chosen per tier by the bake. Both decoders are registered so
    // a chunk loads whichever way it was baked; an unused one costs nothing.
    this.loader.setMeshoptDecoder(MeshoptDecoder as unknown as Parameters<GLTFLoader["setMeshoptDecoder"]>[0]);

    // KTX2 textures stay GPU-compressed (huge VRAM saving) but need the renderer
    // to know which transcode target (BC7/ASTC/ETC2/…) the GPU supports. Only
    // enabled when a renderer is supplied AND the manifest actually carries ktx2
    // urls; otherwise the runtime transparently falls back to WebP.
    const hasKtx2 = opts.tex.images.some((im) => im.rungs.some((r) => r.ktx2));
    if (opts.renderer && hasKtx2 && this.cfg.useKtx2) {
      try {
        this.ktx2 = new KTX2Loader().setTranscoderPath(opts.ktx2Path ?? "/basis/").detectSupport(opts.renderer);
      } catch (e) {
        console.warn("KTX2 unavailable, falling back to WebP", e);
        this.ktx2 = null;
      }
    }

    for (const c of this.manifest.chunks) {
      this.states.set(c.id, { entry: c, current: null, group: null, loadingTier: null, textured: false, outTicks: 0, texOwner: null, texPx: null });
      const g = sphereGizmo(c.center, c.radius);
      this.gizmos.set(c.id, g);
      this.boundsGroup.add(g);
    }

    this.hidden = this.resolveHidden();
    this.hiddenNodes = this.resolveHiddenNodes();
  }

  /**
   * `cfg.hide` -> the chunk ids it matches.
   *
   * The rules name a source mesh by the MATERIAL it carries, because that is
   * the only name the bake keeps: a chunk GLB's node and mesh are both unnamed,
   * while `materials.json` still carries what the source scene called each
   * material. `minRadiusMetres` is the tie-break for a material that is shared
   * — the district ground plane and the terminal's own pavement are the same
   * material, and only one of them is 8 km across.
   *
   * A rule matches when EVERY predicate it states holds. One that states none
   * matches nothing, so a typo cannot blank the model.
   */
  private resolveHidden(): Set<string> {
    const rules = this.cfg.hide;
    const out = new Set<string>();
    if (!rules?.length) return out;
    const nameOf = new Map(this.materials.map((m) => [m.index, m.name]));
    for (const c of this.manifest.chunks) {
      for (const r of rules) {
        // A `node` rule addresses the animated group, not the chunks — see
        // resolveHiddenNodes. Skipping it here is what stops it matching every
        // chunk by stating no chunk predicate.
        if (r.node !== undefined) continue;
        if (r.material === undefined && r.minRadiusMetres === undefined) continue;
        if (r.material !== undefined) {
          const want = Array.isArray(r.material) ? r.material : [r.material];
          if (!c.materials.some((i) => want.includes(nameOf.get(i) ?? ""))) continue;
        }
        if (r.minRadiusMetres !== undefined && c.radius < r.minRadiusMetres) continue;
        out.add(c.id);
        break;
      }
    }
    return out;
  }

  /** The `node` half of `cfg.hide` — object names in `animated.glb`.
   *
   *  Separate from the chunk rules because it is a different addressing scheme
   *  over a different thing: chunks are anonymous and are named by the material
   *  they carry, while the animated group keeps the source hierarchy and is
   *  named directly. See `StreamHideRule.node` for why that group cannot be
   *  reached by a chunk rule at all. */
  private resolveHiddenNodes(): Set<string> {
    const out = new Set<string>();
    for (const r of this.cfg.hide ?? []) if (r.node) out.add(r.node);
    return out;
  }

  /**
   * Apply the current `node` rules to the animated group.
   *
   * Reversible by construction: exactly the objects this hid are the objects it
   * un-hides, so a mesh that is invisible for some OTHER reason (applyMaterials
   * hides un-texturable shells) is never quietly switched back on.
   *
   * Called from both `setConfig` and `initAnimation` because either can land
   * last — the dollhouse config is normally in force before `animated.glb`
   * finishes downloading, and the view can also swap long after it has.
   */
  private applyNodeHiding() {
    for (const o of this.hiddenAnimated) o.visible = true;
    this.hiddenAnimated = [];
    const g = this.animGroup;
    if (!g || this.hiddenNodes.size === 0) return;
    g.traverse((o) => {
      if (o === g || !o.visible || !this.hiddenNodes.has(o.name)) return;
      o.visible = false;
      this.hiddenAnimated.push(o);
    });
  }

  /**
   * Swap the streaming config in place.
   *
   * Used to move between the ground view and the aerial view, which are two
   * genuinely different strategies over the SAME manifest (see the `aerial`
   * `aerial` block in site.json). Rebuilding the manager instead would throw
   * away `cpuCache` — every decoded chunk — so returning to the ground would
   * re-download the whole walk-around set. Here the next `update()` simply
   * re-decides every chunk's tier against the new numbers, and anything the
   * cache still holds re-mounts without touching the network.
   *
   * `effUnload` is reset rather than carried over: it is a running average of a
   * feedback loop tuned to the OLD bands, and a value shrunk under the ground
   * budget would otherwise start the aerial view already clamped.
   */
  setConfig(cfg: StreamingConfig) {
    this.cfg = cfg;
    this.effUnload = cfg.unloadDist;
    // Re-resolved rather than carried over: `hide` is authored per view, so the
    // dollhouse's backdrop planes come back the moment the walking config takes
    // over (and vice versa) — on the next tick, through the ordinary
    // mount/unmount path.
    this.hidden = this.resolveHidden();
    // The animated group has no mount/unmount path to ride, so its rules are
    // applied here and now rather than being picked up by the next tick.
    this.hiddenNodes = this.resolveHiddenNodes();
    this.applyNodeHiding();
  }

  /** Toggle the per-chunk bounding-sphere gizmos (radius + tier colour). */
  setBoundsVisible(v: boolean) {
    this.boundsOn = v;
    if (v && this.boundsGroup.parent !== this.scene) this.scene.add(this.boundsGroup);
    else if (!v && this.boundsGroup.parent === this.scene) this.scene.remove(this.boundsGroup);
  }

  /** Distance from camera to the chunk surface (0 when the camera is inside it).
   *
   *  Measured to the bounding BOX, not the bounding sphere. The sphere is the
   *  half-DIAGONAL, so for anything elongated it credits a chunk with far more
   *  nearness than it has: a 400 m quay wall seen broadside from 300 m scored
   *  a surface distance of 0 and loaded, while a 4 m bollard standing on it
   *  scored 300 and did not. Because the band test is the same for both, the
   *  big object stayed and its co-located detail vanished — a canopy without
   *  its poles, a stack without its containers.
   *
   *  The box is always inside the sphere, so this distance is always >= the old
   *  one: strictly fewer chunks load, and each one is tiered more honestly.
   *  Measured over 150 ground cameras on portla-c5-v4, 360 deg, at the old
   *  50/150/300 bands: holes 3057 -> 2242 objects, resident 6.0 -> 5.3 MB.
   *  It is a better metric, but it is NOT the cure on its own — see `_bands`
   *  in `site.json > stream`, whose numbers are what actually closed the gap. */
  private surfaceDist(cam: THREE.Vector3, c: ChunkEntry): number {
    const mn = c.bbox.min,
      mx = c.bbox.max;
    const dx = cam.x < mn[0] ? mn[0] - cam.x : cam.x > mx[0] ? cam.x - mx[0] : 0;
    const dy = cam.y < mn[1] ? mn[1] - cam.y : cam.y > mx[1] ? cam.y - mx[1] : 0;
    const dz = cam.z < mn[2] ? mn[2] - cam.z : cam.z > mx[2] ? cam.z - mx[2] : 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Which tier a chunk wants, or null to unload. Applies radius-scaling. */
  private tierFor(dist: number, c: ChunkEntry, current: Tier | null): Tier | null {
    let d = dist;
    if (this.cfg.radiusScale > 0) {
      const scale = 1 + this.cfg.radiusScale * (c.radius / this.cfg.refRadius - 1);
      if (scale > 0) d = dist / scale;
    }
    // hysteresis: when already mounted, require going a bit further before dropping
    const h = current ? this.cfg.hysteresis : 0;
    if (d < this.cfg.nearDist) return "near";
    if (d < this.cfg.midDist + h) return "mid";
    if (d < this.cfg.farDist + h) return "far";
    // effUnload is the budget-adjusted radius (== cfg.unloadDist when the
    // resident budget is off or comfortably met).
    if (d < Math.min(this.cfg.unloadDist, this.effUnload) + h) return "far";
    return null;
  }

  /** The tier a chunk should mount at: its band, or `cfg.forceTier` when the
   *  view pins one. The pin never overrides the null — what loads and what
   *  unloads stays the bands' decision, only the quality is overridden. */
  private bandTier(dist: number, st: ChunkState): Tier | null {
    const band = this.tierFor(dist, st.entry, st.current);
    if (band === null) return null;
    return this.cfg.forceTier ?? band;
  }

  /** Only the tiers this chunk actually has (small chunks may be near-only). */
  private resolveTier(c: ChunkEntry, want: Tier | null): Tier | null {
    if (want === null) return null;
    const have = new Set(c.lods.map((l) => l.tier));
    if (have.has(want)) return want;
    // fall back to the closest available coarser, then finer
    const order = TIER_ORDER;
    const wi = order.indexOf(want);
    for (let i = wi; i < order.length; i++) if (have.has(order[i])) return order[i];
    for (let i = wi; i >= 0; i--) if (have.has(order[i])) return order[i];
    return null;
  }

  /** True if the chunk's (margin-expanded) bounding sphere is inside the view. */
  private inView(c: ChunkEntry): boolean {
    this._sphere.center.set(c.center[0], c.center[1], c.center[2]);
    this._sphere.radius = c.radius + this.cfg.frustumMargin;
    return this._frustum.intersectsSphere(this._sphere);
  }

  /**
   * The texture pass. Shared by both geometry modes and, in "resident" mode,
   * the only adaptive work left per tick.
   *
   * Two things can be out of date on a mounted chunk:
   *
   *   a) whether it is textured at all — that follows a distance cutoff rather
   *      than the tier, so a chunk stays loaded past textureDist but drops to a
   *      flat material once beyond it;
   *   b) which RUNG it carries — progressive mounting dresses a chunk at the
   *      smallest rung so it can appear immediately, and this is where it is
   *      promoted to the rung its tier actually asks for.
   *
   * (a) is unbudgeted: it is a downgrade to a flat material, or a chunk coming
   * back into the textured zone, and both are rare. (b) is budgeted and
   * nearest-first, because after a fill EVERY chunk wants an upgrade at once
   * and an unbounded wave would re-saturate the network the fill just cleared.
   *
   * Works unchanged under residency: `st.current` is then always
   * `residentTier`, so `texRung[st.current]` is that tier's rung for every
   * chunk and only the distance CUTOFF in (a) still varies.
   */
  private updateTextures() {
    const upgrades: { st: ChunkState; dist: number }[] = [];
    for (const st of this.states.values()) {
      if (!st.current || !st.group || st.retexturing) continue;
      const want = this.isTextured(st.current, st.entry);
      if (want !== st.textured) { this.retexture(st, want); continue; }
      if (!want) continue;
      if (st.texPx !== this.cfg.texRung[st.current]) {
        upgrades.push({ st, dist: this.surfaceDist(this._cam, st.entry) });
      }
    }
    if (upgrades.length) {
      upgrades.sort((a, b) => a.dist - b.dist);
      const perTick = Math.max(1, this.cfg.texUpgradesPerTick);
      for (let i = 0; i < Math.min(perTick, upgrades.length); i++) {
        const u = upgrades[i];
        this.retexture(u.st, true, this.cfg.texRung[u.st.current!]);
      }
    }
  }

  /**
   * WHOLE-MODEL RESIDENCY — a different strategy, not a setting of the other
   * one: no distance bands, no frustum gate, no unloading, no memory governor.
   *
   * Every chunk is mounted once at `residentTier` and stays. What that buys is
   * the absence of artefacts rather than a number: nothing pops in, nothing
   * swaps LOD mid-walk, and the resident-byte governor can no longer evict a
   * chunk that the very next tick re-requests. It is only affordable because
   * the near tier of this bake is a few tens of megabytes; `geometryMode` is
   * the gate that keeps it opt-in per bake.
   *
   * Textures still adapt — they are the one thing that genuinely varies with
   * distance, and they swap in place so they never flash.
   */
  private updateResident() {
    // Show anything that finished decoding since the last tick.
    this.flushReveals();

    // Anything still missing, nearest-first. RE-SCANNED each tick rather than
    // consumed from a queue, so a chunk whose load failed is retried instead of
    // being silently absent for the whole session — bounded by MAX_MOUNT_FAILS
    // so a genuinely dead URL cannot spin forever.
    const missing: { st: ChunkState; dist: number }[] = [];
    for (const st of this.states.values()) {
      if (st.current || st.loadingTier) continue;
      if (!st.entry.lods.length) continue; // fully instanced: InstanceLayer draws it
      if ((this.mountFails.get(st.entry.id) ?? 0) >= ChunkManager.MAX_MOUNT_FAILS) continue;
      missing.push({ st, dist: this.surfaceDist(this._cam, st.entry) });
    }
    if (missing.length) {
      missing.sort((a, b) => a.dist - b.dist);
      const n = Math.min(this.cfg.maxLoadsPerTick, missing.length);
      for (let i = 0; i < n; i++) {
        const tier = this.resolveTier(missing[i].st.entry, this.cfg.residentTier);
        if (tier) this.mount(missing[i].st, tier);
      }
    }

    this.updateTextures();

    // Every placement, once. The resident set never changes after this, so
    // sync()'s signature check early-outs on every subsequent tick and the
    // instance buffers are built exactly one time.
    if (this.instances && !this.instSynced) {
      this.instResident = this.manifest.chunks.filter((c) => c.inst);
      this.instances.sync(this.instResident);
      this.instSynced = true;
    }
  }

  /** Main entry — call ~updateHz times/sec with the camera. */
  update(camera: THREE.Camera) {
    camera.getWorldPosition(this._cam);
    // Residency is a different strategy, not a setting of this one — see
    // updateResident() for what it drops and why.
    if (this.mode === "adaptive" && this.cfg.geometryMode === "resident") {
      this.updateResident();
      return;
    }
    // View frustum for this tick (stream culling): only chunks the camera can
    // see are loaded, except a 360° bubble of nearby chunks (alwaysLoadDist).
    const cull = this.mode === "adaptive" && this.cfg.frustumCull;
    if (cull) {
      // Compute the inverse ourselves rather than trusting camera.matrixWorldInverse,
      // which the renderer only refreshes at draw time (could be stale on the first tick).
      camera.updateMatrixWorld();
      this._camInv.copy(camera.matrixWorld).invert();
      this._projView.multiplyMatrices(camera.projectionMatrix, this._camInv);
      this._frustum.setFromProjectionMatrix(this._projView);
    }

    // 0. Show whatever finished decoding since the last tick, as one wave.
    //    Before the tier decisions below, so this tick reasons about what is
    //    actually on screen rather than about a set one flush out of date.
    this.flushReveals();

    // 1. decide desired tier per chunk, collect changes with a priority (distance)
    const changes: { st: ChunkState; want: Tier | null; dist: number }[] = [];
    this.instResident.length = 0;
    for (const st of this.states.values()) {
      const dist = this.surfaceDist(this._cam, st.entry);
      // Hidden chunks are decided before anything else: never downloaded, and
      // unmounted on the first tick after a config that hides them takes over.
      const hidden = this.hidden.has(st.entry.id);
      let want = hidden
        ? null
        : this.mode === "full"
          ? this.resolveTier(st.entry, "near") // full baseline: everything at near, never unload
          : this.resolveTier(st.entry, this.bandTier(dist, st));
      // Cull out-of-view chunks beyond the always-load bubble. Nearby chunks
      // (dist <= alwaysLoadDist) stay loaded 360° so looking around is instant.
      if (cull && want !== null && dist > this.cfg.alwaysLoadDist && !this.inView(st.entry)) {
        // Anti-thrash: a chunk that just left the view is kept for a short grace
        // period before we unload+dispose it, so turning/walking doesn't churn
        // GPU re-uploads. Only after `cullGraceTicks` out-of-view ticks does it go.
        if (st.current !== null && st.outTicks < this.cfg.cullGraceTicks) {
          st.outTicks++;
          want = st.current; // hold (three still skips drawing it via render-time culling)
        } else {
          want = null; // grace expired, or never loaded → unload / stay unloaded
        }
      } else {
        st.outTicks = 0; // in view or within the near bubble
      }
      // Queue a change when the desired tier differs from what's mounted — UNLESS
      // we're already loading exactly that tier (avoid duplicate loads). The old
      // guard `st.loadingTier !== want` mis-fired on UNLOADS: with want=null and
      // nothing loading (loadingTier=null), `null !== null` is false, so far
      // chunks that should unload were never queued. They then lingered past
      // unloadDist, crossed textureDist, got their textures stripped, and showed
      // as white shells. Only skip when a load for `want` is genuinely in flight.
      const alreadyLoadingWant = want !== null && st.loadingTier === want;
      if (want !== st.current && !alreadyLoadingWant) changes.push({ st, want, dist });

      // Instance residency is decided from the BAND, not from `want`. A chunk
      // that is entirely instanced has no lods, so resolveTier() returns null for
      // it and it would never count as resident — yet its placements are exactly
      // what should be drawn. Re-test the band directly, and apply the same
      // frustum rule so instanced geometry culls like everything else.
      if (st.entry.inst && this.instances && !hidden) {
        const inBand = this.mode === "full" || this.tierFor(dist, st.entry, st.current) !== null;
        const visible = !cull || dist <= this.cfg.alwaysLoadDist || this.inView(st.entry);
        if (inBand && visible) this.instResident.push(st.entry);
      }
    }

    // 2. unloads are immediate & unbounded; loads are throttled, closest-first
    const unloads = changes.filter((c) => c.want === null);
    const loads = changes.filter((c) => c.want !== null).sort((a, b) => a.dist - b.dist);

    for (const u of unloads) this.unmount(u.st);
    let budget = this.cfg.maxLoadsPerTick;
    // HARD CAP, applied BEFORE mounting. The feedback loop in phase 4 can only
    // react after the fact (so the figure would briefly overshoot); this refuses
    // to start a load that would push us past the ceiling in the first place.
    // Geometry cost is known up front from the manifest; texture cost is handled
    // by phase 4. Chunks inside nearDist are always allowed — never blank out
    // what the camera is standing in.
    const hardCap = this.gpuCapBytes();
    let projected = hardCap === Infinity ? 0 : this.residentBytes();
    for (const l of loads) {
      if (budget <= 0) break;
      if (l.st.loadingTier) continue;
      if (hardCap !== Infinity && l.dist > this.cfg.nearDist) {
        const cost = this.estGeomBytes(l.st.entry, l.want as Tier);
        if (projected + cost > hardCap) continue; // skip; a nearer chunk may still fit
        projected += cost;
      }
      budget--;
      this.mount(l.st, l.want as Tier);
    }

    // 3. Textures.
    this.updateTextures();

    // 4. HARD MEMORY CEILING. Distance bands alone can't bound memory (density
    //    varies), so drive the effective unload radius from what's actually
    //    resident: shrink it while over budget, ease it back out when under.
    const gpuCap = this.gpuCapBytes();
    if (gpuCap !== Infinity) {
      const budget = gpuCap;
      let bytes = this.residentBytes();
      if (bytes > budget) {
        this.effUnload = Math.max(this.cfg.nearDist * 1.5, this.effUnload * 0.85);
        // Far over: evict the furthest resident chunks now rather than waiting
        // for the radius to converge over several ticks.
        let guard = 0;
        // Evict all the way down to the ceiling (not 5% over) — the budget is a
        // hard limit, and textures acquired during mount can only be accounted
        // for here, after the fact.
        while (bytes > budget && guard++ < 32) {
          let worst: ChunkState | null = null;
          let worstScore = -1;
          let worstD = -1;
          for (const st of this.states.values()) {
            if (!st.current || !st.group) continue;
            const d = this.surfaceDist(this._cam, st.entry);
            // Evict what you CANNOT see first — dropping an on-screen chunk
            // makes a building visibly vanish (or half-vanish, since one
            // building's parts span several chunks). Out-of-view chunks are
            // scored far higher so they always go first.
            const score = d + (cull && !this.inView(st.entry) ? 1e6 : 0);
            if (score > worstScore) { worstScore = score; worstD = d; worst = st; }
          }
          // never strip what you're standing in — better to overshoot than blank the view
          if (!worst || worstD <= this.cfg.nearDist) break;
          this.unmount(worst);
          bytes = this.residentBytes();
        }
      } else if (bytes < budget * 0.8) {
        this.effUnload = Math.min(this.cfg.unloadDist, this.effUnload * 1.06 + 2);
      }
    }

    // 4a. The other two pools. Both are bounded here rather than at their point
    //     of use: the CPU cache used to be trimmed only from inside mount(), so
    //     descending out of the aerial view — which mounts nothing new — left it
    //     sitting at the aerial ceiling indefinitely.
    this.evictCache();
    this.evictTextures();

    // 4b. redraw the shared instance buffers for whatever is resident now.
    //     Cheap: it early-outs unless the resident set actually changed.
    this.instances?.sync(this.instResident);

    // 5. debug gizmos: color each resident chunk's bounding sphere by its tier
    if (this.boundsOn) {
      for (const st of this.states.values()) {
        const g = this.gizmos.get(st.entry.id);
        if (!g) continue;
        if (st.current) {
          (g.material as THREE.LineBasicMaterial).color.setHex(TIER_COLOR[st.current]);
          g.visible = true;
        } else {
          g.visible = false;
        }
      }
    }
  }

  /** DECODED bytes uploaded to the GPU right now: the vertex buffers of every
   *  mounted chunk, plus every texture currently resident.
   *
   *  This used to sum the manifest's ENCODED sizes and compare them to
   *  `residentBudgetMB`, which is what made the ceiling unenforceable: at the
   *  13.5x decode ratio measured on this bake, a "34 MB" budget was really
   *  ~460 MB, so the feedback loop below never once fired. Measured off the
   *  decoded geometry instead, there is no ratio left to drift. */
  private residentBytes(): number {
    let n = 0;
    for (const st of this.states.values()) {
      if (!st.current || !st.group) continue;
      const url = this.lodUrl(st.entry, st.current);
      if (url) n += this.cpuBytes.get(url) ?? 0;
    }
    return n + this.textureBytesTotal();
  }

  /** Heap held by decoded groups — mounted AND merely cached. three keeps the
   *  typed arrays after upload, so a mounted chunk is charged here as well as
   *  in residentBytes(); that double charge is real and was previously invisible. */
  private cpuCacheBytes(): number {
    let n = 0;
    for (const b of this.cpuBytes.values()) n += b;
    return n;
  }

  private textureBytesTotal(): number {
    let n = 0;
    for (const b of this.texBytes.values()) n += b;
    return n;
  }

  /** The GPU ceiling actually in force: the lower of what this DEVICE can
   *  afford and what the scene asks for.
   *
   *  Two knobs rather than one because they answer different questions.
   *  `budget.gpuMB` is the device's limit and must not move when the view
   *  swaps; `cfg.residentBudgetMB` is per-config, which is how the aerial view
   *  — where all 816 chunks are legitimately in frame at the far tier — asks
   *  for more headroom than the walking view needs. Both are now REAL decoded
   *  megabytes; `residentBudgetMB` used to be encoded bytes, which is why 34
   *  was really ~460 MB and never bound anything. */
  private gpuCapBytes(): number {
    const dev = this.budget.gpuMB > 0 ? this.budget.gpuMB : Infinity;
    const scene = this.cfg.residentBudgetMB > 0 ? this.cfg.residentBudgetMB : Infinity;
    const mb = Math.min(dev, scene);
    if (mb === Infinity) return Infinity;
    // Read the degrade scale LIVE rather than baking it in at construction: a
    // context loss lands on the canvas mid-session, and the next tick must
    // already be evicting against the reduced ceiling.
    return mb * currentGpuScale() * 1048576;
  }

  /** What a chunk WILL cost once decoded, for the pre-mount hard cap.
   *
   *  Exact once the chunk has been decoded at that tier. Before that, the only
   *  figure available is the manifest's encoded size, so it is scaled by a
   *  decode ratio LEARNED from the chunks already measured this session rather
   *  than hardcoded — the 13.5x in `site.json`'s note is true of this bake and
   *  would silently mislead on the next one. */
  private estGeomBytes(c: ChunkEntry, tier: Tier): number {
    const url = this.lodUrl(c, tier);
    const known = url ? this.cpuBytes.get(url) : undefined;
    if (known !== undefined) return known;
    const lod = c.lods.find((l) => l.tier === tier);
    if (!lod) return 0;
    return lod.bytes * this.decodeRatio;
  }

  /** Running mean of decoded/encoded over every chunk measured so far. Seeded
   *  with this bake's measured figure so the very first tick is not wild. */
  private decodeRatio = 13.5;
  private ratioSamples = 0;

  private learnRatio(encoded: number, decoded: number) {
    if (encoded <= 0 || decoded <= 0) return;
    const r = decoded / encoded;
    this.ratioSamples++;
    // Plain incremental mean; converges within the first few dozen chunks and
    // then barely moves, which is what we want from a sizing hint.
    this.decodeRatio += (r - this.decodeRatio) / Math.min(this.ratioSamples, 64);
  }

  private lodUrl(c: ChunkEntry, tier: Tier): string | null {
    const lod = c.lods.find((l) => l.tier === tier);
    return lod ? this.assetBase + lod.url : null;
  }

  /** A chunk is textured if its tier is a textured tier AND its surface is
   *  within textureDist (keeps the textured zone smaller than the loaded zone). */
  private isTextured(tier: Tier, c: ChunkEntry): boolean {
    if (!this.cfg.texturedTiers.includes(tier)) return false;
    return this.surfaceDist(this._cam, c) < this.cfg.textureDist;
  }

  private async mount(st: ChunkState, tier: Tier) {
    st.loadingTier = tier;
    let queued = false;
    const url = this.lodUrl(st.entry, tier);
    if (!url) { st.loadingTier = null; return; } // fully-instanced chunk: nothing to fetch
    try {
      let group = this.cpuCache.get(url);
      if (group) {
        // cache hit → mark most-recently-used (Map keeps insertion order).
        this.cpuCache.delete(url);
        this.cpuCache.set(url, group);
      } else {
        // A url we have decoded before and evicted is a re-download — the churn
        // figure the HUD reports, and the one that says whether cpuMB is too low.
        if (this.everCached.has(url)) this.redownloads++;
        const gltf = await this.loader.loadAsync(url);
        group = gltf.scene;
        this.cpuCache.set(url, group);
        // MEASURED, not estimated: walk the decoded attributes. This is the
        // number every ceiling in this file is enforced against.
        const bytes = geometryBytes(group);
        this.cpuBytes.set(url, bytes);
        this.everCached.add(url);
        const lod = st.entry.lods.find((l) => l.tier === tier);
        if (lod) this.learnRatio(lod.bytes, bytes);
      }
      // If state moved on while we were loading, bail.
      if (st.loadingTier !== tier) return;

      const textured = this.isTextured(tier, st.entry);
      // Wait for the textures BEFORE putting anything on screen. three's
      // TextureLoader hands back an empty texture and fills the pixels in later,
      // so mounting first meant a chunk appeared as raw white geometry until its
      // images arrived. Awaiting here means a chunk is either absent or fully
      // textured — never a white shell, and never half-dressed next to its
      // neighbours. The previously mounted tier stays visible, fully textured,
      // for the whole load: we acquire under a NEW owner token and only release
      // the old one after the swap below.
      //
      // WHICH rung it waits for is the difference between a scene that appears
      // in one piece and one that assembles itself in front of you. At the
      // tier's own rung every chunk waits on its own images, so chunks land one
      // at a time in whatever order the network returns them. At the preview
      // rung they nearly all hit the texture cache instead — the whole image set
      // is ~0.1 MB at 128 px and is SHARED between chunks — so a neighbourhood
      // appears together and sharpens a moment later (the upgrade pass in
      // update() phase 3).
      //
      // Two exceptions, both because the preview rung is for filling a BLANK,
      // never for replacing something already on screen:
      //
      //   a tier SWAP keeps the previous tier visible for the whole load, so
      //   there is nothing to hurry and no reason to accept a blurry
      //   intermediate — dropping to 128 px and climbing back would be a
      //   visible quality dip every time you walk toward a building;
      //
      //   NEAR is by definition what is being looked at. The preview rung
      //   resolves to ~128 px, which on a decal off a 2048 source is mush, and
      //   near is only a few dozen chunks, so waiting for their real textures
      //   costs almost nothing.
      const isSwap = st.group !== null && st.current !== null;
      // RESIDENT mode never previews. The preview rung exists to cover a blank
      // area fast while the camera is already in the scene; under residency the
      // whole fill happens behind the loading screen, where a blurry-then-sharp
      // pass buys nothing and only risks the loader lifting mid-upgrade. It is
      // also nearly free to skip — chunks share images, so after the first
      // handful every request is a texture-cache hit anyway.
      const preview =
        this.cfg.progressiveTex &&
        textured &&
        !isSwap &&
        tier !== "near" &&
        this.cfg.geometryMode !== "resident";
      const px = preview ? PREVIEW_PX : this.cfg.texRung[tier];
      const owner = `${st.entry.id}#${++this.texSeq}`;
      await this.applyMaterials(group, tier, textured, owner, px);
      if (st.loadingTier !== tier) {
        this.releaseTextures(owner); // abandoned mid-load; don't leak the refs
        return;
      }

      // Ready, but NOT shown yet — queued for the next flush so it arrives with
      // its neighbours. `loadingTier` deliberately stays set until then: it is
      // what stops a duplicate load being queued for the same chunk, and what
      // keeps evictCache() from disposing the group between here and the flush.
      this.pendingReveal.push({ st, group, tier, owner, textured, px, at: performance.now() });
      queued = true;
    } catch (e) {
      // Counted so the resident scan can give up on a URL that never resolves;
      // ignored by the streamed path, which will simply re-evaluate the chunk
      // next time the camera brings it back into a band.
      this.mountFails.set(st.entry.id, (this.mountFails.get(st.entry.id) ?? 0) + 1);
      console.error("chunk load failed", url, e);
    } finally {
      // A QUEUED chunk keeps `loadingTier` until flushReveals clears it. Clearing
      // it here would make every reveal look stale and drop the whole batch.
      if (!queued && st.loadingTier === tier) st.loadingTier = null;
    }
  }

  /**
   * Reveal decoded chunks as an OUTWARD SWEEP, not in the order they happened to
   * finish.
   *
   * This is the whole of the arrival smoothing, and it is done by ORDERING
   * rather than by shading — deliberately. Two per-chunk fades were tried in the
   * repo this came from and both read as flicker, not as a fade: a plain alpha
   * ramp (flipping `transparent` moves a mesh into the transparent pass, where
   * it sorts against itself and shows its own back faces, and recompiles the
   * shader at each end of the ramp), and `alphaHash` (a STOCHASTIC threshold
   * meant to be resolved by temporal AA — without TAA it is animated per-pixel
   * noise). Nothing here touches a material, so there is nothing left to
   * flicker.
   *
   * The rule: a chunk waits until nothing NEARER is still decoding. Decode time
   * tracks chunk size, so completion order is essentially size order, which is
   * why an unordered fill looked random. Gating on "is anything closer still
   * coming?" turns it into a front that moves out from the camera.
   *
   * MAX_HOLD_MS is the escape hatch: one slow near chunk must not dam everything
   * behind it, so anything waiting longer than that goes anyway.
   */
  private static readonly MAX_HOLD_MS = 600;

  private flushReveals() {
    if (!this.pendingReveal.length) return;

    // The nearest chunk still DECODING — queued ones are already done, so they
    // must not count as blocking themselves.
    const queued = new Set(this.pendingReveal.map((r) => r.st));
    let nearestInFlight = Infinity;
    for (const st of this.states.values()) {
      if (!st.loadingTier || queued.has(st)) continue;
      const d = this.surfaceDist(this._cam, st.entry);
      if (d < nearestInFlight) nearestInFlight = d;
    }

    const now = performance.now();
    const ready: typeof this.pendingReveal = [];
    const hold: typeof this.pendingReveal = [];
    for (const r of this.pendingReveal) {
      const d = this.surfaceDist(this._cam, r.st.entry);
      if (d <= nearestInFlight || now - r.at >= ChunkManager.MAX_HOLD_MS) ready.push(r);
      else hold.push(r);
    }
    this.pendingReveal = hold;
    if (!ready.length) return;

    ready.sort((a, b) => this.surfaceDist(this._cam, a.st.entry) - this.surfaceDist(this._cam, b.st.entry));
    for (const r of ready) {
      const { st, group, tier, owner, textured, px } = r;
      // The world moved on while this sat in the queue — the chunk was unloaded,
      // or re-tiered out from under it. Drop it and let go of its textures.
      if (st.loadingTier !== tier) {
        this.releaseTextures(owner);
        continue;
      }
      st.textured = textured;
      st.texPx = textured ? px : null;
      // swap: remove previous tier group, add new
      if (st.group && st.group !== group) this.scene.remove(st.group);
      if (group.parent !== this.scene) this.scene.add(group);
      // Old textures are only now unreferenced — anything still shared with the
      // new tier keeps a nonzero refcount and is never disposed.
      if (st.texOwner && st.texOwner !== owner) this.releaseTextures(st.texOwner);
      st.texOwner = owner;
      st.group = group;
      st.current = tier;
      st.loadingTier = null;
    }
    // bound the CPU cache now that these chunks are mounted (they're protected).
    this.evictCache();
  }

  /**
   * Re-dress an ALREADY VISIBLE group by swapping MAPS ON THE EXISTING
   * MATERIALS — never by rebuilding them.
   *
   * This is the whole difference between a texture upgrade you cannot see and a
   * white flash. `applyMaterials()` disposes each material and builds a fresh
   * one whose `map` is null until its image resolves; run against a group that
   * is on screen, the mesh renders untextured for the length of a network fetch.
   * That was tolerable when the only caller was the textureDist crossing, which
   * essentially never fires (textureDist == unloadDist). Progressive mounting
   * makes EVERY chunk take this path once, a few at a time, so the scene would
   * flash its way through itself mesh by mesh.
   *
   * Here the old map stays bound until `assign` swaps the new one in, so there
   * is no frame without a texture.
   */
  private async reskinTextures(
    group: THREE.Group,
    tier: Tier,
    textured: boolean,
    owner: string,
    px: number,
  ) {
    const pending: Promise<void>[] = [];
    const fmt = this.cfg.texFormat?.[tier] ?? "auto";
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const idx = mesh.userData.matIdx as number | undefined;
      const def = idx === undefined ? undefined : this.materials[idx];
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (!m || !def?.textures) return;
      const T = def.textures;
      if (!textured) {
        // Going flat: this one IS a visible change, and is meant to be — it is
        // what "beyond textureDist" looks like. Dropping the maps is immediate
        // because there is nothing to wait for.
        m.map = null;
        m.normalMap = null;
        m.metalnessMap = null;
        m.roughnessMap = null;
        m.emissiveMap = null;
        m.needsUpdate = true;
        return;
      }
      if (T.baseColor) pending.push(this.setTex(T.baseColor, px, "srgb", owner, (t) => { m.map = t; m.needsUpdate = true; }, fmt));
      if (T.normal) pending.push(this.setTex(T.normal, px, "linear", owner, (t) => { m.normalMap = t; m.needsUpdate = true; }, fmt));
      if (T.metallicRoughness)
        pending.push(this.setTex(T.metallicRoughness, px, "linear", owner, (t) => { m.metalnessMap = t; m.roughnessMap = t; m.needsUpdate = true; }, fmt));
      if (T.emissive) pending.push(this.setTex(T.emissive, px, "srgb", owner, (t) => { m.emissiveMap = t; m.needsUpdate = true; }, fmt));
    });
    // settle, never reject — setTex catches its own failures.
    await Promise.all(pending);
  }

  /** Re-dress an ALREADY VISIBLE group: either because it crossed textureDist,
   *  or to promote it off the progressive preview rung. The new maps are fetched
   *  and assigned before the old owner is released, so the mesh is never on
   *  screen with a disposed or missing texture. Guarded by `st.retexturing` so
   *  the update tick can't stack duplicate passes. */
  private async retexture(st: ChunkState, want: boolean, px?: number) {
    const group = st.group, tier = st.current;
    if (!group || !tier) return;
    st.retexturing = true;
    const rung = px ?? this.cfg.texRung[tier];
    const owner = `${st.entry.id}#${++this.texSeq}`;
    try {
      await this.reskinTextures(group, tier, want, owner, rung);
      // Bail if the chunk was unmounted or re-tiered while we were loading.
      if (st.group !== group || st.current !== tier) {
        this.releaseTextures(owner);
        return;
      }
      if (st.texOwner && st.texOwner !== owner) this.releaseTextures(st.texOwner);
      st.texOwner = owner;
      st.textured = want;
      st.texPx = want ? rung : null;
    } finally {
      st.retexturing = false;
    }
  }

  private unmount(st: ChunkState) {
    // Cancel any load still in flight for this chunk: mount() re-checks
    // loadingTier after its await and bails when it no longer matches, so a
    // chunk that leaves the view mid-load won't briefly pop in then tear down.
    st.loadingTier = null;
    if (st.group) {
      this.scene.remove(st.group);
      // Actually free the GPU vertex buffers now (scene.remove alone does NOT —
      // three keeps them uploaded until geometry.dispose()). The BufferAttribute
      // data stays in JS memory inside cpuCache, so re-mounting just re-uploads
      // (no re-download / re-decode) until the LRU eventually evicts it.
      this.disposeGeometry(st.group);
    }
    if (st.texOwner) this.releaseTextures(st.texOwner);
    st.texOwner = null;
    st.texPx = null;
    st.textured = false;
    st.group = null;
    st.current = null;
    st.outTicks = 0;
  }

  /** Free GPU buffers for a group's geometries (keeps CPU-side attribute data). */
  private disposeGeometry(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
  }

  /** Fully release a cached group (GPU geometry + built materials) before it
   *  leaves the CPU cache; its textures were already dropped on unmount. */
  private disposeGroupFull(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // The bounds tree is plain JS memory that geometry.dispose() knows
      // nothing about, and this is the point the geometry stops being reusable.
      if (m.geometry) dropBoundsTree(m.geometry);
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose?.();
    });
  }

  /**
   * LRU-bound the CPU cache BY BYTES, dropping least-recently-used groups that
   * are not on screen until the heap is back under `budget.cpuMB`.
   *
   * It used to be bounded by ENTRY COUNT (`cache.limitChunks`), which cannot
   * bound memory here for two reasons. Chunk sizes span a 3.6 m to 692 m radius,
   * so one slot is not one cost. And the count was reasoned against the 816
   * chunks in the manifest while the cache is keyed by URL — 816 chunks x 3
   * tiers = 2,448 distinct entries, since one chunk you walk up to occupies
   * far, mid and near in turn. With ~230 mounted urls protected, the authored
   * 500 left ~270 free slots, which a walk exhausts in a minute or two and then
   * evicts steadily.
   *
   * `cacheLimit` is still honoured as a secondary cap so an authored number is
   * never silently ignored, but the byte ceiling is what actually governs.
   * Never evicts a mounted chunk — that would blank the scene.
   */
  private evictCache() {
    // Residency never unmounts, so every cached group is still referenced and
    // the scan can only ever be work with no result. Guarded here rather than
    // only at the call site because mount() trims the cache too.
    if (this.cfg.geometryMode === "resident") return;
    const cap = this.budget.cpuMB * 1048576;
    let bytes = this.cpuCacheBytes();
    if (bytes <= cap && this.cpuCache.size <= this.cfg.cacheLimit) return;

    const mounted = new Set<string>();
    for (const st of this.states.values()) {
      if (st.current) { const u = this.lodUrl(st.entry, st.current); if (u) mounted.add(u); }
      // Also protect a tier that is mid-mount. Since mounting now waits for
      // textures, a decoded group can sit here unmounted for a while; evicting
      // it would dispose the geometry we are about to add to the scene.
      if (st.loadingTier) { const u = this.lodUrl(st.entry, st.loadingTier); if (u) mounted.add(u); }
    }
    for (const [url, group] of this.cpuCache) {
      if (bytes <= cap && this.cpuCache.size <= this.cfg.cacheLimit) break;
      if (mounted.has(url)) continue; // protect visible chunks
      this.disposeGroupFull(group);
      bytes -= this.cpuBytes.get(url) ?? 0;
      this.cpuCache.delete(url);
      this.cpuBytes.delete(url);
      this.evictedChunks++;
    }
  }

  /**
   * Bound the texture cache by bytes, evicting only what nothing references.
   *
   * The old policy disposed a texture the instant its refcount hit zero, with
   * none of the anti-thrash the rest of this file has (20 m band hysteresis,
   * `cullGraceTicks`, the chunk LRU). Because the cache key carries the rung —
   * image 0 at 512, 256 and 128 px are three independent entries — the near-rung
   * set drops to zero refs every time the last chunk within `nearDist` unmounts,
   * i.e. roughly every 50 m walked, and every one of them was then re-fetched
   * and re-decoded on the way back. Idle textures are cheap to keep: all 70
   * images at the 128 px rung total 0.1 MB.
   */
  private evictTextures() {
    const cap = this.budget.texMB * currentGpuScale() * 1048576;
    let bytes = this.textureBytesTotal();
    if (bytes <= cap) return;
    for (const key of this.texIdle.keys()) {
      if (bytes <= cap) break;
      // Re-acquired since it was idled: acquire() removes it from texIdle, so
      // this is belt-and-braces against a key lingering in the idle list.
      if ((this.texRefs.get(key)?.size ?? 0) > 0) continue;
      this.texCache.get(key)?.dispose();
      bytes -= this.texBytes.get(key) ?? 0;
      this.texCache.delete(key);
      this.texBytes.delete(key);
      this.texRefs.delete(key);
      this.texIdle.delete(key);
      this.evictedTextures++;
    }
  }

  // ---- materials ----
  /** Builds every material for the group and resolves once all their textures
   *  are actually decoded and assigned. Callers must await this before showing
   *  the group, or it renders untextured white.
   *
   *  Acquires texture refs under `owner` and releases NOTHING — the caller owns
   *  the handover, releasing the previous token only once this group is on
   *  screen. Releasing here (as this used to) disposed textures the visible mesh
   *  was still using. */
  private async applyMaterials(group: THREE.Group, tier: Tier, textured: boolean, owner: string, px?: number) {
    // The rung to request. Explicit so mount() can dress a chunk at the preview
    // rung and a later pass can upgrade the SAME group to the tier's own.
    const rung = px ?? this.cfg.texRung[tier];
    const pending: Promise<void>[] = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Recover the source material index. We can only read it from the GLB
      // material name ("mat_N") on the FIRST pass — after that we overwrite the
      // material with an unnamed one, so cache the index on the mesh. Without
      // this, a chunk that unloads and returns re-reads name "" -> idx -1 ->
      // gray/untextured fallback.
      let idx = mesh.userData.matIdx as number | undefined;
      if (idx === undefined) {
        const name = (mesh.material as THREE.Material)?.name ?? "";
        idx = name.startsWith("mat_") ? parseInt(name.slice(4), 10) : -1;
        mesh.userData.matIdx = idx;
        // Streamed chunks sit directly on the scene, outside drei's <Bvh>, and
        // everything that picks the world raycasts scene.children. Give each
        // chunk mesh a raycast that builds its bounds tree on first real hit.
        mesh.raycast = lazyBvhRaycast;
        // Same shadow contract as the single-GLB loader this replaced: every
        // mesh both casts and receives, so buildings shade themselves and the
        // ground. The sun's map is frozen after a burst per fit (SceneLights),
        // so this stays cheap to walk.
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      const def = this.materials[idx];
      (mesh.material as THREE.Material)?.dispose?.(); // free the previous built material (shared textures survive)
      // COLOR_0 -> three's `color` attribute. It only takes effect if the
      // material opts in, so read it off the geometry rather than the material
      // def: the port's OSM_Buildings carry their tint as vertex colours on 23%
      // of the model's triangles, and without this they all render flat.
      const hasVertexColor = !!mesh.geometry.getAttribute("color");
      mesh.material = this.buildMaterial(def, textured ? tier : null, owner, pending, hasVertexColor, tier, rung);
      // Hide un-texturable shells: some decimated mid/far LOD prims lose their
      // UVs in baking, so a texture can't map onto them and they'd render as a
      // solid white patch. The near LOD keeps all its UVs, so the building comes
      // back fully textured as you approach.
      //
      // But this only applies to geometry that is SUPPOSED to carry a baseColor
      // map. Plenty of source geometry is authored with no material at all and
      // therefore no TEXCOORD_0 — in the LA port that is 46% of the triangles
      // (rails, ballast_bed, the road/curb/sidewalk networks). For those, a
      // missing UV set is normal, not damage, and the old `textured && !hasUV`
      // test hid every road in the scene. Gate on the material actually wanting
      // a texture instead.
      const wantsBaseColor = textured && !!def?.textures.baseColor;
      const hasUV = !!mesh.geometry.getAttribute("uv");
      mesh.visible = !(wantsBaseColor && !hasUV);
    });
    // settle, never reject: setTex catches its own failures and resolves, so a
    // single dead texture can't wedge a chunk out of the scene forever.
    await Promise.all(pending);
  }

  /** True when three's transmission pass may run for a chunk mounted at
   *  `mountTier`. See `StreamConfig.render.transmission` for why this is gated:
   *  ONE visible transmissive material re-renders the whole opaque scene into a
   *  buffer every frame, which roughly doubles draw calls. */
  private transmissionAllowed(mountTier: Tier | null): boolean {
    const mode = this.cfg.transmission;
    if (mode === "all") return true;
    if (mode === "off") return false;
    return mountTier === "near";
  }

  private buildMaterial(
    def: MaterialDef | undefined,
    tier: Tier | null,
    owner: string,
    pending: Promise<void>[],
    vertexColors = false,
    /** The tier the chunk is MOUNTED at — distinct from `tier`, which is null
     *  when the chunk is beyond textureDist. Only used to gate transmission. */
    mountTier: Tier | null = tier,
    /** The rung to request. Defaults to the tier's own. */
    px?: number,
  ): THREE.Material {
    const wantsTransmission = !!def && (def.transmission ?? 0) > 0;
    const hasTransmission = wantsTransmission && this.transmissionAllowed(mountTier);
    const m = hasTransmission ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
    m.vertexColors = vertexColors;
    if (def) {
      const bc = def.baseColorFactor;
      m.color.setRGB(bc[0], bc[1], bc[2]);
      m.metalness = def.metallic;
      m.roughness = def.roughness;
      m.emissive.setRGB(def.emissiveFactor[0], def.emissiveFactor[1], def.emissiveFactor[2]);
      m.transparent = def.alphaMode === "BLEND";
      if (def.alphaMode === "MASK") {
        m.alphaTest = def.alphaCutoff;
      }
      m.side = def.doubleSided ? THREE.DoubleSide : THREE.FrontSide;

      if (wantsTransmission && !hasTransmission) {
        // Transmission is gated off for this tier, so stand it in with plain
        // alpha. This bake's transmissive materials all carry no baseColour map
        // and `thickness: 0`, which is exactly the case where the two look
        // near-identical — and this costs no extra scene render.
        m.transparent = true;
        m.opacity = Math.max(0.05, 1 - (def.transmission ?? 0) * 0.85);
        m.depthWrite = false;
      }

      if (hasTransmission) {
        // Glass / water: transparent-refractive. Rendered via three's transmission
        // pass so you can see textured geometry behind it (e.g. the pool bottom).
        const pm = m as THREE.MeshPhysicalMaterial;
        pm.transmission = def.transmission!;
        pm.ior = def.ior ?? 1.5;
        pm.thickness = def.thickness ?? 0;
        if (def.attenuationColor) pm.attenuationColor.setRGB(def.attenuationColor[0], def.attenuationColor[1], def.attenuationColor[2]);
        if (def.attenuationDistance != null) pm.attenuationDistance = def.attenuationDistance;
      }

      if (tier && def.textures) {
        const rung = px ?? this.cfg.texRung[tier];
        // Format is per tier too, so a distant chunk can take the cheap
        // GPU-compressed rung while what you stand next to stays WebP-crisp
        // (or vice versa). See site.json > stream.tiers.<t>.texture.format.
        const fmt = this.cfg.texFormat?.[tier] ?? "auto";
        const T = def.textures;
        // Every slot returns a promise that settles when the image is decoded and
        // assigned; applyMaterials awaits them all so the mesh is never shown
        // with a half-populated material.
        if (T.baseColor) pending.push(this.setTex(T.baseColor, rung, "srgb", owner, (t) => { m.map = t; m.needsUpdate = true; }, fmt));
        if (T.normal) pending.push(this.setTex(T.normal, rung, "linear", owner, (t) => { m.normalMap = t; m.needsUpdate = true; }, fmt));
        if (T.metallicRoughness)
          pending.push(this.setTex(T.metallicRoughness, rung, "linear", owner, (t) => { m.metalnessMap = t; m.roughnessMap = t; m.needsUpdate = true; }, fmt));
        // (occlusion/aoMap skipped: needs a 2nd UV set the geometry doesn't carry)
        if (T.emissive) pending.push(this.setTex(T.emissive, rung, "srgb", owner, (t) => { m.emissiveMap = t; m.needsUpdate = true; }, fmt));
      }
    } else {
      m.color.set(0x888888);
    }
    return m;
  }

  private glWrap(v: number | undefined): THREE.Wrapping {
    if (v === 33071) return THREE.ClampToEdgeWrapping;
    if (v === 33648) return THREE.MirroredRepeatWrapping;
    return THREE.RepeatWrapping; // 10497 default
  }

  /** Resolve which file (KTX2 if available+supported, else WebP) and cache key a
   *  slot maps to at the requested resolution. */
  private pickTex(slot: TexSlot, px: number, format: TexFormat = "auto") {
    const img = this.tex.images.find((i) => i.id === slot.image);
    if (!img) return null;
    // clamp requested px to what exists (largest rung <= px, else smallest)
    const avail = img.rungs.map((r) => r.px).sort((a, b) => b - a);
    const chosen = avail.find((p) => p <= px) ?? avail[avail.length - 1];
    const rung = img.rungs.find((r) => r.px === chosen)!;
    const wS = this.glWrap(slot.wrapS), wT = this.glWrap(slot.wrapT);
    // Format is per tier (site.json > stream.tiers.<t>.texture.format):
    //   "ktx2" prefer GPU-compressed, "webp" force the WebP rung, "auto" = ktx2
    //   when available. A ktx2 request silently falls back to webp when the rung
    //   was never baked or the GPU cannot transcode — never a hard failure.
    const useKtx2 = format !== "webp" && !!this.ktx2 && !!rung.ktx2;
    const url = useKtx2 ? rung.ktx2! : rung.url;
    const bytes = useKtx2 ? rung.ktx2Bytes ?? rung.bytes : rung.bytes;
    // key includes wrap (same image, different tiling = different texture),
    // format (a webp and a ktx2 of the same rung are distinct GPU objects), and
    // the UV channel + KHR_texture_transform. The last part matters: the port
    // reuses one image across slots that scale it differently, and THREE stores
    // channel/offset/repeat ON the texture — sharing one instance between them
    // would make whichever loaded last win for both.
    const xf = slot.transform;
    const xfKey = xf ? `~${xf.offset}:${xf.scale}:${xf.rotation}` : "";
    const key = `${slot.image}@${chosen}#${wS},${wT}${useKtx2 ? "!k" : ""}|uv${uvChannel(slot)}${xfKey}`;
    return { url, key, useKtx2, wS, wT, bytes };
  }

  private configureTex(
    tex: THREE.Texture,
    space: "srgb" | "linear",
    wS: THREE.Wrapping,
    wT: THREE.Wrapping,
    slot?: TexSlot,
  ) {
    tex.flipY = false; // ignored for compressed KTX2 (data already top-left) — matches WebP path
    tex.wrapS = wS;
    tex.wrapT = wT;
    tex.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    // Which UV attribute to sample. three reads `channel` (0 -> uv, 1 -> uv1);
    // the port's ground/water normal + metallicRoughness maps live on uv1.
    tex.channel = uvChannel(slot);
    // KHR_texture_transform. Mirrors three's own GLTFLoader handling: offset and
    // scale map straight onto offset/repeat, and rotation is NEGATED because
    // glTF rotates the UVs while three rotates the texture, about center (0,0).
    const xf = slot?.transform;
    if (xf) {
      tex.offset.fromArray(xf.offset);
      tex.repeat.fromArray(xf.scale);
      tex.rotation = -xf.rotation;
      tex.center.set(0, 0);
    }
    tex.needsUpdate = true;
  }

  /** Acquire a texture and hand it to `assign` once the pixels are actually
   *  there. BOTH paths are async: KTX2 transcodes on a worker, and three's
   *  TextureLoader also decodes off-thread — `.load()` returns an empty texture
   *  immediately, which is what used to put white buildings on screen. The
   *  returned promise resolves only after `assign` has run (or the load failed),
   *  so callers can gate mounting on it. Shared textures are refcounted per
   *  chunk and deduped by key. */
  private setTex(
    slot: TexSlot,
    px: number,
    space: "srgb" | "linear",
    owner: string,
    assign: (t: THREE.Texture) => void,
    format: TexFormat = "auto",
  ): Promise<void> {
    const pick = this.pickTex(slot, px, format);
    if (!pick) return Promise.resolve();
    if (!this.texRefs.has(pick.key)) this.texRefs.set(pick.key, new Set());
    this.texRefs.get(pick.key)!.add(owner);
    if (!this.texOwned.has(owner)) this.texOwned.set(owner, new Set());
    this.texOwned.get(owner)!.add(pick.key);
    // Referenced again — take it back off the idle list so evictTextures()
    // cannot drop a texture that is about to be drawn with.
    this.texIdle.delete(pick.key);

    const cached = this.texCache.get(pick.key);
    if (cached) { assign(cached); return Promise.resolve(); }

    // One in-flight load per key, whichever format it resolves to; a second
    // chunk wanting the same image piggybacks instead of re-fetching.
    let p = this.texLoading.get(pick.key);
    if (!p) {
      const loader: { loadAsync(url: string): Promise<THREE.Texture> } =
        pick.useKtx2 && this.ktx2 ? this.ktx2 : new THREE.TextureLoader();
      p = loader
        .loadAsync(this.assetBase + pick.url)
        .then((tex) => {
          this.configureTex(tex, space, pick.wS, pick.wT, slot);
          this.texLoading.delete(pick.key);
          // Discard if every chunk that wanted it left while we were decoding.
          if ((this.texRefs.get(pick.key)?.size ?? 0) === 0) { tex.dispose(); return null; }
          this.texCache.set(pick.key, tex);
          // MEASURED off the decoded texture: block-compressed mip chain for a
          // KTX2, RGBA8 + generated mips for a WebP. `pick.bytes` is the file
          // size on the wire, which for a 512 px WebP understates the resident
          // cost by ~40x.
          this.texBytes.set(pick.key, textureBytes(tex));
          return tex;
        })
        .catch((e) => {
          console.error("texture load failed", pick.url, e);
          this.texLoading.delete(pick.key);
          return null; // resolve, never reject — a dead texture must not wedge a chunk
        });
      this.texLoading.set(pick.key, p);
    }
    return p.then((t) => { if (t) assign(t); });
  }

  /** Drop one mount's claim on its textures.
   *
   *  A key that falls to zero refs is IDLED, not disposed — it joins the LRU
   *  tail and only actually goes when `evictTextures()` finds the pool over
   *  budget. That is the whole anti-thrash fix: turning around, or walking a
   *  block and back, no longer re-fetches and re-decodes the near rung.
   *
   *  Walks only the keys THIS owner held (via `texOwned`) rather than the whole
   *  cache, which the old version did on every single unmount. */
  private releaseTextures(owner: string) {
    const keys = this.texOwned.get(owner);
    if (!keys) return;
    for (const key of keys) {
      const refs = this.texRefs.get(key);
      if (!refs) continue;
      refs.delete(owner);
      // Idle, not dead. Re-inserted at the tail so the most recently released
      // texture is the LAST one evicted.
      if (refs.size === 0 && this.texCache.has(key)) {
        this.texIdle.delete(key);
        this.texIdle.set(key, true);
      }
    }
    this.texOwned.delete(owner);
  }

  stats(): StreamStats {
    const byTier: Record<Tier, number> = { near: 0, mid: 0, far: 0 };
    let visible = 0,
      loading = 0,
      tris = 0,
      residentGeom = 0;
    for (const st of this.states.values()) {
      if (st.loadingTier) loading++;
      if (st.current && st.group) {
        visible++;
        byTier[st.current]++;
        const lod = st.entry.lods.find((l) => l.tier === st.current);
        if (lod) tris += lod.tris;
        // DECODED bytes uploaded right now, measured off the geometry.
        const url = this.lodUrl(st.entry, st.current);
        if (url) residentGeom += this.cpuBytes.get(url) ?? 0;
      }
    }
    const residentTex = this.textureBytesTotal();
    return {
      visible,
      loading,
      tris,
      cacheBytes: this.cpuCacheBytes(),
      cacheCount: this.cpuCache.size,
      residentBytes: residentGeom + residentTex,
      texCount: this.texCache.size,
      texBytes: residentTex,
      texIdle: this.texIdle.size,
      budgetMB: { cpu: this.budget.cpuMB, gpu: this.budget.gpuMB, tex: this.budget.texMB },
      evictedChunks: this.evictedChunks,
      evictedTextures: this.evictedTextures,
      redownloads: this.redownloads,
      decodeRatio: this.decodeRatio,
      ktx2Active: this.ktx2 !== null && TIER_ORDER.some((t) => (this.cfg.texFormat?.[t] ?? "auto") !== "webp"),
      byTier,
    };
  }

  /** Look for a shared instance palette and, if the model has one, start drawing
   *  from it. Safe and cheap to call for every model: a missing palette.glb just
   *  returns false and leaves this manager on the pure per-chunk path. */
  async initInstancing(): Promise<boolean> {
    if (this.instances) return true;
    if (!this.manifest.chunks.some((c) => c.inst)) return false;
    const layer = new InstanceLayer(this.scene, this.assetBase, this.loader, (matIdx) => {
      // Palette geometry is always resident, so it is always textured at the
      // near rung. Its textures are held under one permanent owner token rather
      // than a per-chunk one — they must outlive any individual chunk.
      //
      // The transmission gate gets `null`, NOT the near tier. The palette is
      // resident for the whole session, so treating it as near would keep the
      // transmission pass — a full extra scene render — switched on permanently
      // no matter what the chunk tiers were doing, which is exactly the cost the
      // gate exists to remove. Only "all" turns it on here.
      const pending: Promise<void>[] = [];
      const gate = this.cfg.transmission === "all" ? TIER_ORDER[0] : null;
      return this.buildMaterial(this.materials[matIdx], TIER_ORDER[0], "palette", pending, false, gate);
    });
    const ok = await layer.load();
    // The palette download outlives a dispose() that lands mid-flight (React
    // Strict Mode remounts this manager, and so does any view that unmounts the
    // scene). Without this check the layer would add its InstancedMeshes to a
    // scene the manager no longer owns, and nothing would ever take them out.
    if (!ok) return false;
    if (this.disposed) { layer.dispose(); return false; }
    this.instances = layer;
    return true;
  }

  /** Load animated.glb, bind its materials and start every clip. No-op for a
   *  model whose manifest carries no `animated` block. */
  async initAnimation(): Promise<boolean> {
    if (this.mixer) return true;
    const a = this.manifest.animated;
    if (!a) return false;
    let gltf;
    try {
      gltf = await this.loader.loadAsync(this.assetBase + a.url);
    } catch (e) {
      console.error("animated.glb failed to load", e);
      return false;
    }
    // Always resident, so it is textured at the near rung under a permanent
    // owner token rather than a per-chunk one.
    await this.applyMaterials(gltf.scene, TIER_ORDER[0], true, "animated");
    // Same race as initInstancing(): don't attach a rig to a scene this manager
    // has already let go of.
    if (this.disposed) {
      this.releaseTextures("animated");
      this.disposeGroupFull(gltf.scene);
      return false;
    }
    this.scene.add(gltf.scene);
    this.animGroup = gltf.scene;
    // The config was very likely set before this download finished, so apply
    // its `node` rules now — otherwise the dollhouse gets its ocean back every
    // time animated.glb happens to land after the view has already switched.
    this.applyNodeHiding();
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) this.mixer.clipAction(clip).play();
    return gltf.animations.length > 0;
  }

  /** Advance the animation clock. Call once per rendered frame, in seconds. */
  updateAnimation(dt: number) {
    this.mixer?.update(dt);
  }

  /** Palette draw/instance counts for the debug HUD, or null when inactive. */
  instanceStats() {
    return this.instances?.stats() ?? null;
  }

  dispose() {
    this.disposed = true;
    this.setBoundsVisible(false);
    for (const g of this.gizmos.values()) {
      g.geometry.dispose();
      (g.material as THREE.Material).dispose();
    }
    this.gizmos.clear();
    for (const st of this.states.values()) if (st.group) this.scene.remove(st.group);
    for (const t of this.texCache.values()) t.dispose();
    for (const g of this.cpuCache.values())
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          if (m.geometry) dropBoundsTree(m.geometry);
          m.geometry?.dispose();
          const mat = m.material as THREE.Material;
          mat?.dispose();
        }
      });
    for (const r of this.pendingReveal) this.releaseTextures(r.owner);
    this.pendingReveal = [];
    this.hiddenAnimated = [];
    this.texCache.clear();
    this.texLoading.clear();
    this.texRefs.clear();
    this.texOwned.clear();
    this.texBytes.clear();
    this.texIdle.clear();
    this.cpuCache.clear();
    this.cpuBytes.clear();
    this.everCached.clear();
    this.states.clear();
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }
    if (this.animGroup) {
      this.scene.remove(this.animGroup);
      this.disposeGroupFull(this.animGroup);
      this.animGroup = null;
    }
    this.instances?.dispose();
    this.instances = null;
    this.ktx2?.dispose(); // tears down the transcoder worker pool
    this.ktx2 = null;
  }
}
