import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { InstanceLayer } from "./instance-layer";
import { MeshoptDecoder } from "meshoptimizer";
import { TIER_ORDER, type Tier, type TexFormat, type StreamingConfig, type DeviceProfile } from "./config";
import type { Manifest, ChunkEntry, MaterialDef, TexManifest, TexSlot } from "./types";
import type { StreamHideRule } from "@/config/schema";
import { dropBoundsTree, lazyBvhRaycast } from "./bvh-raycast";
import { geometryBytes, textureBytes, resolveBudget, currentGpuScale, type MemoryBudget } from "./memory";
import { prefetchUrls } from "@/shared/runtime/prefetch";
import { clearStreamReach, publishStreamReach } from "@/vr/engine/stream";

interface ChunkState {
  entry: ChunkEntry;
  current: Tier | null;
  group: THREE.Group | null;
  loadingTier: Tier | null;
  textured: boolean;
  outTicks: number;
  texOwner: string | null;
  retexturing?: boolean;
  texPx: number | null;
}

const PREVIEW_PX = 1;

const TIER_COLOR: Record<Tier, number> = { near: 0x39d353, mid: 0xe3b341, far: 0xf0883e };

function sphereGizmo(center: [number, number, number], radius: number): THREE.LineSegments {
  const seg = 40;
  const pts: number[] = [];
  const push = (x: number, y: number, z: number) => pts.push(x, y, z);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const b = ((i + 1) / seg) * Math.PI * 2;
    const ca = Math.cos(a) * radius, sa = Math.sin(a) * radius;
    const cb = Math.cos(b) * radius, sb = Math.sin(b) * radius;
    push(ca, sa, 0); push(cb, sb, 0);
    push(ca, 0, sa); push(cb, 0, sb);
    push(0, ca, sa); push(0, cb, sb);
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

function uvChannel(slot?: TexSlot): number {
  const uv = slot?.uv ?? 0;
  return uv === 1 ? 1 : 0;
}

export interface StreamStats {
  visible: number;
  loading: number;
  tris: number;
  cacheBytes: number;
  cacheCount: number;
  residentBytes: number;
  texCount: number;
  texBytes: number;
  texIdle: number;
  budgetMB: { cpu: number; gpu: number; tex: number };
  evictedChunks: number;
  evictedTextures: number;
  redownloads: number;
  decodeRatio: number;
  ktx2Active: boolean;
  dressing: number;
  byTier: Record<Tier, number>;
}

function normaliseClip(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
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
  private cpuCache = new Map<string, THREE.Group>();
  private cpuBytes = new Map<string, number>();
  private texCache = new Map<string, THREE.Texture>();
  private texLoading = new Map<string, Promise<THREE.Texture | null>>();
  private texRefs = new Map<string, Set<string>>();
  private texOwned = new Map<string, Set<string>>();
  private texBytes = new Map<string, number>();
  private texIdle = new Map<string, true>();
  private texSeq = 0;
  private budget: MemoryBudget;
  private evictedChunks = 0;
  private evictedTextures = 0;
  private redownloads = 0;
  private everCached = new Set<string>();
  private ktx2: KTX2Loader | null = null;
  private instances: InstanceLayer | null = null;
  private instResident: ChunkEntry[] = [];
  private animGroup: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private loopActions: THREE.AnimationAction[] = [];
  private onceActions = new Map<string, THREE.AnimationAction>();
  private oneShotNames = new Set<string>();
  private deferredActions = new Set<THREE.AnimationAction>();
  private deferredNames = new Set<string>();
  private deferredRunning = false;
  private loopsRunning = true;
  private oncePlaying = new Set<string>();
  private onMixerFinished: ((e: { action: THREE.AnimationAction }) => void) | null = null;

  private _cam = new THREE.Vector3();
  private _frustum = new THREE.Frustum();
  private _projView = new THREE.Matrix4();
  private _camInv = new THREE.Matrix4();
  private _sphere = new THREE.Sphere();

  private boundsGroup = new THREE.Group();
  private gizmos = new Map<string, THREE.LineSegments>();
  private boundsOn = false;

  private hidden = new Set<string>();
  private pickable = new Set<string>();
  private cpuFreed = new Set<string>();
  private capReported = false;
  private retierBudget = 2;
  private retierBurst = 0;
  private texBurst = 0;
  private _prevCam = new THREE.Vector3(NaN, NaN, NaN);
  private static readonly JUMP_METRES = 50;
  private static readonly BURST_TICKS = 30;
  private static readonly TEX_BURST_SCALE = 4;
  private retierWanted = 0;
  private retexWanted = 0;
  private profile: DeviceProfile;
  private wireBytes = 0;
  private wireReported = false;

  private hiddenNodes = new Set<string>();
  private hiddenAnimated: THREE.Object3D[] = [];

  private pendingReveal: {
    st: ChunkState;
    group: THREE.Group;
    tier: Tier;
    owner: string;
    textured: boolean;
    px: number;
    at: number;
  }[] = [];

  private mountFails = new Map<string, number>();
  private static readonly MAX_MOUNT_FAILS = 3;

  private instSynced = false;

  private mode: "adaptive" | "full";
  private disposed = false;
  private effUnload = Infinity;

  constructor(opts: {
    scene: THREE.Scene;
    assetBase: string;
    manifest: Manifest;
    materials: MaterialDef[];
    tex: TexManifest;
    dracoPath?: string;
    mode?: "adaptive" | "full";
    config: StreamingConfig;
    renderer?: THREE.WebGLRenderer;
    ktx2Path?: string;
    budget?: MemoryBudget;
    profile?: DeviceProfile;
  }) {
    this.scene = opts.scene;
    this.assetBase = opts.assetBase.replace(/\/$/, "") + "/";
    this.manifest = opts.manifest;
    this.materials = opts.materials;
    this.tex = opts.tex;
    this.mode = opts.mode ?? "adaptive";
    this.cfg = opts.config;
    this.effUnload = this.cfg.unloadDist;
    this.profile = opts.profile ?? "desktop";
    this.budget = opts.budget ?? resolveBudget(this.profile, opts.renderer);

    const draco = new DRACOLoader();
    draco.setDecoderPath(opts.dracoPath ?? "/draco/");
    draco.setWorkerLimit(
      Math.max(4, Math.min(12, (typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4) - 1)),
    );
    draco.preload();
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(draco);
    this.loader.setMeshoptDecoder(MeshoptDecoder as unknown as Parameters<GLTFLoader["setMeshoptDecoder"]>[0]);

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
    this.pickable = this.resolvePickable();
    this.hiddenNodes = this.resolveHiddenNodes();
  }

  private resolveHidden(): Set<string> {
    return this.resolveChunkRules(this.cfg.hide);
  }

  private resolvePickable(): Set<string> {
    return this.resolveChunkRules(this.cfg.pick);
  }

  private resolveChunkRules(rules: StreamHideRule[] | undefined): Set<string> {
    const out = new Set<string>();
    if (!rules?.length) return out;
    const nameOf = new Map(this.materials.map((m) => [m.index, m.name]));
    for (const c of this.manifest.chunks) {
      for (const r of rules) {
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

  private resolveHiddenNodes(): Set<string> {
    const out = new Set<string>();
    for (const r of this.cfg.hide ?? []) if (r.node) out.add(r.node);
    return out;
  }

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

  warmTextures(target: StreamingConfig, from: THREE.Vector3): void {
    const rows: { c: ChunkEntry; d: number }[] = [];
    for (const st of this.states.values()) {
      if (!st.entry.lods.length || this.hidden.has(st.entry.id)) continue;
      const d = this.surfaceDist(from, st.entry);
      if (d >= target.textureDist) continue;
      rows.push({ c: st.entry, d });
    }
    rows.sort((a, b) => a.d - b.d);

    const seen = new Set<string>();
    const urls: string[] = [];
    for (const { c, d } of rows) {
      const tier: Tier =
        d < target.nearDist ? "near" : d < target.midDist ? "mid" : "far";
      if (!target.texturedTiers.includes(tier)) continue;
      const px = target.texRung[tier];
      const fmt = target.texFormat?.[tier] ?? "auto";
      for (const mi of c.materials) {
        const def = this.materials[mi];
        if (!def) continue;
        const T = def.textures;
        for (const slot of [T.baseColor, T.normal, T.metallicRoughness, T.emissive]) {
          if (!slot) continue;
          const pick = this.pickTex(slot, px, fmt);
          if (!pick || seen.has(pick.url)) continue;
          seen.add(pick.url);
          urls.push(this.assetBase + pick.url);
        }
      }
    }
    prefetchUrls(urls);
  }

  setConfig(cfg: StreamingConfig) {
    const rungsChanged =
      !this.cfg || TIER_ORDER.some((t) => this.cfg.texRung[t] !== cfg.texRung[t]);
    this.cfg = cfg;
    if (rungsChanged) this.texBurst = ChunkManager.BURST_TICKS;
    this.effUnload = cfg.unloadDist;
    this.hidden = this.resolveHidden();
    this.pickable = this.resolvePickable();
    this.hiddenNodes = this.resolveHiddenNodes();
    this.applyNodeHiding();
  }

  setBoundsVisible(v: boolean) {
    this.boundsOn = v;
    if (v && this.boundsGroup.parent !== this.scene) this.scene.add(this.boundsGroup);
    else if (!v && this.boundsGroup.parent === this.scene) this.scene.remove(this.boundsGroup);
  }

  private surfaceDist(cam: THREE.Vector3, c: ChunkEntry): number {
    const mn = c.bbox.min,
      mx = c.bbox.max;
    const dx = cam.x < mn[0] ? mn[0] - cam.x : cam.x > mx[0] ? cam.x - mx[0] : 0;
    const dy = cam.y < mn[1] ? mn[1] - cam.y : cam.y > mx[1] ? cam.y - mx[1] : 0;
    const dz = cam.z < mn[2] ? mn[2] - cam.z : cam.z > mx[2] ? cam.z - mx[2] : 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private tierFor(dist: number, c: ChunkEntry, current: Tier | null): Tier | null {
    let d = dist;
    if (this.cfg.radiusScale > 0) {
      const scale = 1 + this.cfg.radiusScale * (c.radius / this.cfg.refRadius - 1);
      if (scale > 0) d = dist / scale;
    }
    const h = current ? this.cfg.hysteresis : 0;
    const lim = Math.min(this.cfg.unloadDist, this.effUnload);
    if (d >= lim + h && dist > this.cfg.alwaysLoadDist) return null;
    if (d < this.cfg.nearDist) return "near";
    if (d < this.cfg.midDist + h) return "mid";
    if (d < this.cfg.farDist + h) return "far";
    if (d < lim + h) return "far";
    return null;
  }

  private bandTier(dist: number, st: ChunkState): Tier | null {
    const band = this.tierFor(dist, st.entry, st.current);
    if (band === null) return null;
    return this.cfg.forceTier ?? band;
  }

  private resolveTier(c: ChunkEntry, want: Tier | null): Tier | null {
    if (want === null) return null;
    const have = new Set(c.lods.map((l) => l.tier));
    if (have.has(want)) return want;
    const order = TIER_ORDER;
    const wi = order.indexOf(want);
    for (let i = wi; i < order.length; i++) if (have.has(order[i])) return order[i];
    for (let i = wi; i >= 0; i--) if (have.has(order[i])) return order[i];
    return null;
  }

  private inView(c: ChunkEntry): boolean {
    this._sphere.center.set(c.center[0], c.center[1], c.center[2]);
    this._sphere.radius = c.radius + this.cfg.frustumMargin;
    return this._frustum.intersectsSphere(this._sphere);
  }

  private updateTextures() {
    const upgrades: { st: ChunkState; dist: number }[] = [];
    let flips = 0;
    for (const st of this.states.values()) {
      if (!st.current || !st.group || st.retexturing) continue;
      const want = this.isTextured(st.current, st.entry);
      if (want !== st.textured) { this.retexture(st, want); flips++; continue; }
      if (!want) continue;
      if (st.texPx !== this.rungFor(st.current, st.entry)) {
        upgrades.push({ st, dist: this.surfaceDist(this._cam, st.entry) });
      }
    }
    this.retexWanted = upgrades.length + flips;
    if (upgrades.length) {
      upgrades.sort((a, b) => a.dist - b.dist);
      const base = Math.max(1, this.cfg.texUpgradesPerTick);
      const perTick = this.texBurst > 0 ? base * ChunkManager.TEX_BURST_SCALE : base;
      if (this.texBurst > 0) this.texBurst--;
      for (let i = 0; i < Math.min(perTick, upgrades.length); i++) {
        const u = upgrades[i];
        this.retexture(u.st, true, this.rungFor(u.st.current!, u.st.entry));
      }
    }
  }

  private residentBandTier(dist: number): Tier {
    const want: Tier = dist < this.cfg.nearDist ? "near" : dist < this.cfg.midDist ? "mid" : "far";
    const cap = this.cfg.sharpestTier ?? "near";
    return TIER_ORDER.indexOf(want) < TIER_ORDER.indexOf(cap) ? cap : want;
  }

  private residentRadius(): number {
    return this.profile === "desktop" ? Infinity : this.cfg.unloadDist;
  }

  private updateResident() {
    this.flushReveals();

    const radius = this.residentRadius();
    if (radius !== Infinity) {
      for (const st of this.states.values()) {
        if (!st.current) continue;
        if (this.surfaceDist(this._cam, st.entry) > radius + this.cfg.hysteresis) this.unmount(st);
      }
    }

    const missing: { st: ChunkState; dist: number }[] = [];
    for (const st of this.states.values()) {
      if (st.current || st.loadingTier) continue;
      if (!st.entry.lods.length) continue;
      if ((this.mountFails.get(st.entry.id) ?? 0) >= ChunkManager.MAX_MOUNT_FAILS) continue;
      const d = this.surfaceDist(this._cam, st.entry);
      if (d > radius) continue;
      missing.push({ st, dist: d });
    }
    if (missing.length) {
      missing.sort((a, b) => a.dist - b.dist);
      const cap = this.residentCapBytes();
      let projected = cap === Infinity ? 0 : this.residentBytes();
      const n = Math.min(this.cfg.maxLoadsPerTick, missing.length);
      for (let i = 0; i < n; i++) {
        const tier = this.resolveTier(missing[i].st.entry, this.residentBandTier(missing[i].dist));
        if (!tier) continue;
        if (cap !== Infinity) {
          const cost = this.estGeomBytes(missing[i].st.entry, tier);
          if (projected + cost > cap) {
            if (!this.capReported) {
              this.capReported = true;
              console.warn(
                `[stream] resident ceiling reached at ${(projected / 1048576).toFixed(0)} MB ` +
                  `of ${(cap / 1048576).toFixed(0)} MB (${this.residentCapSource()}). Further ` +
                  "chunks are not being mounted; the far edge of the model will be missing. " +
                  "Shorten the profile's far band, raise residentBudgetMB, or drop " +
                  "residentTier, if this is biting in normal use.",
              );
            }
            break;
          }
          projected += cost;
        }
        this.mount(missing[i].st, tier);
      }
    }

    this.retierResident();
    this.updateTextures();
    this.evictTextures();

    if (this.instances && !this.instSynced) {
      this.instResident = this.manifest.chunks.filter((c) => c.inst);
      this.instances.sync(this.instResident);
      this.instSynced = true;
    }
  }

  private shouldCoarsen(current: Tier, entry: ChunkEntry, dist: number): boolean {
    if (!this.cfg.coarsenResident) return false;
    const cap = this.cfg.sharpestTier ?? "near";
    if (TIER_ORDER.indexOf(current) < TIER_ORDER.indexOf(cap)) return true;
    const loose = this.resolveTier(entry, this.residentBandTier(Math.max(0, dist - this.cfg.hysteresis)));
    return !!loose && TIER_ORDER.indexOf(loose) > TIER_ORDER.indexOf(current);
  }

  private retierResident() {
    this.retierWanted = 0;
    const budget = this.retierBurst > 0
      ? Math.max(this.retierBudget, this.cfg.maxLoadsPerTick)
      : this.retierBudget;
    if (this.retierBurst > 0) this.retierBurst--;
    if (budget <= 0) return;
    const cap = this.residentCapBytes();
    let resident = cap === Infinity ? 0 : this.residentBytes();
    let started = 0;
    const want: { st: ChunkState; tier: Tier; dist: number; sharper: boolean }[] = [];
    for (const st of this.states.values()) {
      if (!st.current || st.loadingTier || this.hidden.has(st.entry.id)) continue;
      const dist = this.surfaceDist(this._cam, st.entry);
      if (dist > this.residentRadius()) continue;
      const tier = this.resolveTier(st.entry, this.residentBandTier(dist));
      if (!tier || tier === st.current) continue;
      const sharper = TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(st.current);
      if (!sharper && !this.shouldCoarsen(st.current, st.entry, dist)) continue;
      want.push({ st, tier, dist, sharper });
    }
    if (!want.length) return;
    this.retierWanted = want.length;
    want.sort((a, b) => Number(b.sharper) - Number(a.sharper) || a.dist - b.dist);
    for (const w of want) {
      if (started >= budget) break;
      if (this.overWireBudget()) continue;
      if (cap !== Infinity) {
        const delta = this.estGeomBytes(w.st.entry, w.tier) - this.estGeomBytes(w.st.entry, w.st.current!);
        if (resident + delta > cap) continue;
        resident += delta;
      }
      started++;
      this.mount(w.st, w.tier);
    }
  }

  update(camera: THREE.Camera) {
    camera.getWorldPosition(this._cam);
    if (
      Number.isFinite(this._prevCam.x) &&
      this._prevCam.distanceTo(this._cam) > ChunkManager.JUMP_METRES
    ) {
      this.retierBurst = ChunkManager.BURST_TICKS;
    }
    this._prevCam.copy(this._cam);
    if (this.mode === "adaptive" && this.cfg.geometryMode === "resident") {
      this.updateResident();
      this.publishReach();
      return;
    }
    const cull = this.mode === "adaptive" && this.cfg.frustumCull;
    if (cull) {
      camera.updateMatrixWorld();
      this._camInv.copy(camera.matrixWorld).invert();
      this._projView.multiplyMatrices(camera.projectionMatrix, this._camInv);
      this._frustum.setFromProjectionMatrix(this._projView);
    }

    this.flushReveals();

    const changes: { st: ChunkState; want: Tier | null; dist: number }[] = [];
    this.instResident.length = 0;
    for (const st of this.states.values()) {
      const dist = this.surfaceDist(this._cam, st.entry);
      const hidden = this.hidden.has(st.entry.id);
      let want = hidden
        ? null
        : this.mode === "full"
          ? this.resolveTier(st.entry, "near")
          : this.resolveTier(st.entry, this.bandTier(dist, st));
      if (cull && want !== null && dist > this.cfg.alwaysLoadDist && !this.inView(st.entry)) {
        if (st.current !== null && st.outTicks < this.cfg.cullGraceTicks) {
          st.outTicks++;
          want = st.current;
        } else {
          want = null;
        }
      } else {
        st.outTicks = 0;
      }
      const alreadyLoadingWant = want !== null && st.loadingTier === want;
      if (want !== st.current && !alreadyLoadingWant) changes.push({ st, want, dist });

      if (st.entry.inst && this.instances && !hidden) {
        const inBand = this.mode === "full" || this.tierFor(dist, st.entry, st.current) !== null;
        const visible = !cull || dist <= this.cfg.alwaysLoadDist || this.inView(st.entry);
        if (inBand && visible) this.instResident.push(st.entry);
      }
    }

    const unloads = changes.filter((c) => c.want === null);
    const loads = changes.filter((c) => c.want !== null).sort((a, b) => a.dist - b.dist);

    for (const u of unloads) this.unmount(u.st);
    let budget = this.cfg.maxLoadsPerTick;
    const hardCap = this.gpuCapBytes();
    let projected = hardCap === Infinity ? 0 : this.residentBytes();
    for (const l of loads) {
      if (budget <= 0) break;
      if (l.st.loadingTier) continue;
      if (hardCap !== Infinity && l.dist > this.cfg.nearDist) {
        const cost = this.estGeomBytes(l.st.entry, l.want as Tier);
        if (projected + cost > hardCap) continue;
        projected += cost;
      }
      budget--;
      this.mount(l.st, l.want as Tier);
    }

    this.updateTextures();

    const gpuCap = this.gpuCapBytes();
    if (gpuCap !== Infinity) {
      const budget = gpuCap;
      let bytes = this.residentBytes();
      if (bytes > budget) {
        this.effUnload = Math.max(this.cfg.nearDist * 1.5, this.effUnload * 0.85);
        let guard = 0;
        while (bytes > budget && guard++ < 32) {
          let worst: ChunkState | null = null;
          let worstScore = -1;
          let worstD = -1;
          for (const st of this.states.values()) {
            if (!st.current || !st.group) continue;
            const d = this.surfaceDist(this._cam, st.entry);
            const score = d + (cull && !this.inView(st.entry) ? 1e6 : 0);
            if (score > worstScore) { worstScore = score; worstD = d; worst = st; }
          }
          if (!worst || worstD <= this.cfg.nearDist) break;
          this.unmount(worst);
          bytes = this.residentBytes();
        }
      } else if (bytes < budget * 0.8) {
        this.effUnload = Math.min(this.cfg.unloadDist, this.effUnload * 1.06 + 2);
      }
    }

    this.evictCache();
    this.evictTextures();

    this.instances?.sync(this.instResident);
    this.publishReach();

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

  private publishReach() {
    let reach = Infinity;
    for (const st of this.states.values()) {
      if (this.hidden.has(st.entry.id) || !st.entry.lods.length) continue;
      if ((this.mountFails.get(st.entry.id) ?? 0) >= ChunkManager.MAX_MOUNT_FAILS) continue;
      if (st.current !== null && st.group !== null) continue;
      const d = this.surfaceDist(this._cam, st.entry);
      if (d < reach) reach = d;
    }
    publishStreamReach(reach);
  }

  private residentBytes(): number {
    let n = 0;
    for (const st of this.states.values()) {
      if (!st.current || !st.group) continue;
      const url = this.lodUrl(st.entry, st.current);
      if (url) n += this.cpuBytes.get(url) ?? 0;
    }
    return n + this.textureBytesTotal();
  }

  private cpuCacheBytes(): number {
    let n = 0;
    for (const [url, b] of this.cpuBytes) {
      if (this.cpuFreed.has(url)) continue;
      n += b;
    }
    return n;
  }

  private textureBytesTotal(): number {
    let n = 0;
    for (const b of this.texBytes.values()) n += b;
    return n;
  }

  private residentCapsMB(): { scene: number; device: number } {
    return {
      scene: this.cfg.residentBudgetMB > 0 ? this.cfg.residentBudgetMB : Infinity,
      device:
        this.budget.gpuMB > 0 && this.budget.texMB > 0
          ? this.budget.gpuMB + this.budget.texMB
          : Infinity,
    };
  }

  private residentCapSource(): string {
    const { scene, device } = this.residentCapsMB();
    return device < scene ? `device budget, ${this.profile}` : "residentBudgetMB";
  }

  private residentCapBytes(): number {
    const { scene, device } = this.residentCapsMB();
    const mb = Math.min(scene, device);
    if (mb === Infinity) return Infinity;
    return mb * currentGpuScale() * 1048576;
  }

  private gpuCapBytes(): number {
    const dev = this.budget.gpuMB > 0 ? this.budget.gpuMB : Infinity;
    const scene = this.cfg.residentBudgetMB > 0 ? this.cfg.residentBudgetMB : Infinity;
    const mb = Math.min(dev, scene);
    if (mb === Infinity) return Infinity;
    return mb * currentGpuScale() * 1048576;
  }

  private estGeomBytes(c: ChunkEntry, tier: Tier): number {
    const url = this.lodUrl(c, tier);
    const known = url ? this.cpuBytes.get(url) : undefined;
    if (known !== undefined) return known;
    const lod = c.lods.find((l) => l.tier === tier);
    if (!lod) return 0;
    return lod.bytes * this.decodeRatio;
  }

  private decodeRatio = 13.5;
  private ratioSamples = 0;

  private learnRatio(encoded: number, decoded: number) {
    if (encoded <= 0 || decoded <= 0) return;
    const r = decoded / encoded;
    this.ratioSamples++;
    this.decodeRatio += (r - this.decodeRatio) / Math.min(this.ratioSamples, 64);
  }

  private lodUrl(c: ChunkEntry, tier: Tier): string | null {
    const lod = c.lods.find((l) => l.tier === tier);
    return lod ? this.assetBase + lod.url : null;
  }

  private rungFor(tier: Tier, c?: ChunkEntry): number {
    if (this.overWireBudget()) {
      if (!this.wireReported) {
        this.wireReported = true;
        console.warn(
          `[stream] wire budget spent: ${(this.wireBytes / 1048576).toFixed(1)} MB of ` +
            `${this.cfg.wireBudgetMB} MB. Texture rungs are pinned to the cheapest from here; ` +
            "geometry is unaffected. Raise stream wireBudgetMB to allow more.",
        );
      }
      return this.cfg.texRung.far;
    }
    const want = this.rungBand(tier, c);
    if (this.profile === "desktop" || this.ktx2) return want;
    return Math.min(want, ChunkManager.WEBP_RUNG_CAP);
  }

  private overWireBudget(): boolean {
    const mb = this.cfg.wireBudgetMB;
    return mb > 0 && this.wireBytes >= mb * 1048576;
  }

  private rungBand(tier: Tier, c?: ChunkEntry): number {
    const R = this.cfg.texRung;
    if (this.cfg.geometryMode !== "resident" || !c) return R[tier];
    const d = this.surfaceDist(this._cam, c);
    if (d < this.cfg.nearDist) return R.near;
    if (d < this.cfg.midDist) return R.mid;
    return R.far;
  }

  private static readonly WEBP_RUNG_CAP = 256;

  private isTextured(tier: Tier, c: ChunkEntry): boolean {
    if (!this.cfg.texturedTiers.includes(tier)) return false;
    return this.surfaceDist(this._cam, c) < this.cfg.textureDist;
  }

  private async mount(st: ChunkState, tier: Tier) {
    st.loadingTier = tier;
    let queued = false;
    const url = this.lodUrl(st.entry, tier);
    if (!url) { st.loadingTier = null; return; }
    try {
      let group = this.cpuCache.get(url);
      if (group && this.cpuFreed.has(url)) {
        this.cpuCache.delete(url);
        this.cpuBytes.delete(url);
        this.cpuFreed.delete(url);
        group = undefined;
      }
      if (group) {
        this.cpuCache.delete(url);
        this.cpuCache.set(url, group);
      } else {
        if (this.everCached.has(url)) this.redownloads++;
        this.wireBytes += st.entry.lods.find((l) => l.tier === tier)?.bytes ?? 0;
        const gltf = await this.loader.loadAsync(url);
        group = gltf.scene;
        this.cpuCache.set(url, group);
        const bytes = geometryBytes(group);
        this.cpuBytes.set(url, bytes);
        this.everCached.add(url);
        const lod = st.entry.lods.find((l) => l.tier === tier);
        if (lod) this.learnRatio(lod.bytes, bytes);
      }
      if (st.loadingTier !== tier) return;

      const textured = this.isTextured(tier, st.entry);
      const isSwap = st.group !== null && st.current !== null;
      const preview =
        this.cfg.progressiveTex &&
        textured &&
        !isSwap &&
        tier !== "near" &&
        this.cfg.geometryMode !== "resident";
      const px = preview ? PREVIEW_PX : this.rungFor(tier, st.entry);
      const owner = `${st.entry.id}#${++this.texSeq}`;
      await this.applyMaterials(group, tier, textured, owner, px);
      if (st.loadingTier !== tier) {
        this.releaseTextures(owner);
        return;
      }

      this.pendingReveal.push({ st, group, tier, owner, textured, px, at: performance.now() });
      queued = true;
    } catch (e) {
      this.mountFails.set(st.entry.id, (this.mountFails.get(st.entry.id) ?? 0) + 1);
      console.error("chunk load failed", url, e);
    } finally {
      if (!queued && st.loadingTier === tier) st.loadingTier = null;
    }
  }

  private static readonly MAX_HOLD_MS = 600;

  private flushReveals() {
    if (!this.pendingReveal.length) return;

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
      if (st.loadingTier !== tier) {
        this.releaseTextures(owner);
        continue;
      }
      st.textured = textured;
      st.texPx = textured ? px : null;
      if (st.group && st.group !== group) {
        this.scene.remove(st.group);
        this.disposeGeometry(st.group);
      }
      if (this.shouldFreeCpu(st.entry.id)) {
        try {
          this.armCpuArrayRelease(group);
          const url = this.lodUrl(st.entry, tier);
          if (url) this.cpuFreed.add(url);
        } catch (e) {
          console.warn("[stream] freeCpuArrays: could not arm release for", st.entry.id, e);
        }
      }
      if (group.parent !== this.scene) this.scene.add(group);
      if (st.texOwner && st.texOwner !== owner) this.releaseTextures(st.texOwner);
      st.texOwner = owner;
      st.group = group;
      st.current = tier;
      st.loadingTier = null;
    }
    this.evictCache();
  }

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
      if (def.textures.baseColor && !mesh.geometry.getAttribute("uv")) return;
      const T = def.textures;
      if (!textured) {
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
    await Promise.all(pending);
  }

  private async retexture(st: ChunkState, want: boolean, px?: number) {
    const group = st.group, tier = st.current;
    if (!group || !tier) return;
    st.retexturing = true;
    const rung = px ?? this.rungFor(tier);
    const owner = `${st.entry.id}#${++this.texSeq}`;
    try {
      await this.reskinTextures(group, tier, want, owner, rung);
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
    st.loadingTier = null;
    if (st.group) {
      this.scene.remove(st.group);
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

  private disposeGeometry(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
  }

  private disposeGroupFull(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry) dropBoundsTree(m.geometry);
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose?.();
    });
  }

  private evictCache() {
    if (this.cfg.geometryMode === "resident") return;
    const cap = this.budget.cpuMB * 1048576;
    let bytes = this.cpuCacheBytes();
    if (bytes <= cap && this.cpuCache.size <= this.cfg.cacheLimit) return;

    const mounted = new Set<string>();
    for (const st of this.states.values()) {
      if (st.current) { const u = this.lodUrl(st.entry, st.current); if (u) mounted.add(u); }
      if (st.loadingTier) { const u = this.lodUrl(st.entry, st.loadingTier); if (u) mounted.add(u); }
    }
    for (const [url, group] of this.cpuCache) {
      if (bytes <= cap && this.cpuCache.size <= this.cfg.cacheLimit) break;
      if (mounted.has(url)) continue;
      this.disposeGroupFull(group);
      bytes -= this.cpuBytes.get(url) ?? 0;
      this.cpuCache.delete(url);
      this.cpuBytes.delete(url);
      this.evictedChunks++;
    }
  }

  private evictTextures() {
    const cap = this.budget.texMB * currentGpuScale() * 1048576;
    let bytes = this.textureBytesTotal();
    if (bytes <= cap) return;
    for (const key of this.texIdle.keys()) {
      if (bytes <= cap) break;
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

  private shouldFreeCpu(chunkId: string): boolean {
    return (
      this.cfg.geometryMode === "resident" &&
      this.cfg.freeCpuArrays &&
      !this.pickable.has(chunkId)
    );
  }

  private armCpuArrayRelease(group: THREE.Group) {
    const drop = function (this: { array: ArrayLike<number> | null }) {
      this.array = null;
    };
    const armed = new Set<object>();
    const arm = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null) => {
      if (!a) return;
      const t = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
        ? (a as THREE.InterleavedBufferAttribute).data
        : a;
      const target = t as unknown as { onUpload?: (cb: () => void) => void };
      if (!target || armed.has(target) || typeof target.onUpload !== "function") return;
      armed.add(target);
      target.onUpload(drop as () => void);
    };
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingSphere) g.computeBoundingSphere();
      for (const attr of Object.values(g.attributes)) arm(attr);
      arm(g.getIndex());
      mesh.raycast = () => {};
    });
  }

  private async applyMaterials(group: THREE.Group, tier: Tier, textured: boolean, owner: string, px?: number) {
    const rung = px ?? this.rungFor(tier);
    const pending: Promise<void>[] = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let idx = mesh.userData.matIdx as number | undefined;
      if (idx === undefined) {
        const name = (mesh.material as THREE.Material)?.name ?? "";
        idx = name.startsWith("mat_") ? parseInt(name.slice(4), 10) : -1;
        mesh.userData.matIdx = idx;
        mesh.raycast = lazyBvhRaycast;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      const def = this.materials[idx];
      (mesh.material as THREE.Material)?.dispose?.();
      const hasVertexColor = !!mesh.geometry.getAttribute("color");
      const hasUV = !!mesh.geometry.getAttribute("uv");
      const unmappable = textured && !!def?.textures?.baseColor && !hasUV;
      mesh.material = this.buildMaterial(def, textured ? tier : null, owner, pending, hasVertexColor, tier, rung, !unmappable);
      mesh.visible = true;
      if (unmappable) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        pending.push(
          this.averageColor(def!.textures!.baseColor!).then((c) => {
            if (!c) return;
            mat.color.multiply(c);
            mat.needsUpdate = true;
          }),
        );
      }
    });
    await Promise.all(pending);
  }

  private transmissionAllowed(mountTier: Tier | null): boolean {
    const mode = this.cfg.transmission;
    if (mode === "all") return true;
    if (mode === "off") return false;
    return mountTier === "near";
  }

  private avgColors = new Map<number, Promise<THREE.Color | null>>();

  private averageColor(slot: TexSlot): Promise<THREE.Color | null> {
    const hit = this.avgColors.get(slot.image);
    if (hit) return hit;
    const p = (async (): Promise<THREE.Color | null> => {
      if (typeof document === "undefined") return null;
      const pick = this.pickTex(slot, 1, "webp");
      if (!pick) return null;
      try {
        const res = await fetch(this.assetBase + pick.url);
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        bmp.close?.();
        return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      } catch {
        return null;
      }
    })();
    this.avgColors.set(slot.image, p);
    return p;
  }

  private buildMaterial(
    def: MaterialDef | undefined,
    tier: Tier | null,
    owner: string,
    pending: Promise<void>[],
    vertexColors = false,
    mountTier: Tier | null = tier,
    px?: number,
    mappable = true,
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
        m.transparent = true;
        m.opacity = Math.max(0.05, 1 - (def.transmission ?? 0) * 0.85);
        m.depthWrite = false;
      }

      if (hasTransmission) {
        const pm = m as THREE.MeshPhysicalMaterial;
        pm.transmission = def.transmission!;
        pm.ior = def.ior ?? 1.5;
        pm.thickness = def.thickness ?? 0;
        if (def.attenuationColor) pm.attenuationColor.setRGB(def.attenuationColor[0], def.attenuationColor[1], def.attenuationColor[2]);
        if (def.attenuationDistance != null) pm.attenuationDistance = def.attenuationDistance;
      }

      if (tier && def.textures && mappable) {
        const rung = px ?? this.rungFor(tier);
        const fmt = this.cfg.texFormat?.[tier] ?? "auto";
        const T = def.textures;
        if (T.baseColor) pending.push(this.setTex(T.baseColor, rung, "srgb", owner, (t) => { m.map = t; m.needsUpdate = true; }, fmt));
        if (T.normal) pending.push(this.setTex(T.normal, rung, "linear", owner, (t) => { m.normalMap = t; m.needsUpdate = true; }, fmt));
        if (T.metallicRoughness)
          pending.push(this.setTex(T.metallicRoughness, rung, "linear", owner, (t) => { m.metalnessMap = t; m.roughnessMap = t; m.needsUpdate = true; }, fmt));
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
    return THREE.RepeatWrapping;
  }

  private pickTex(slot: TexSlot, px: number, format: TexFormat = "auto") {
    const img = this.tex.images.find((i) => i.id === slot.image);
    if (!img) return null;
    const avail = img.rungs.map((r) => r.px).sort((a, b) => b - a);
    const chosen = avail.find((p) => p <= px) ?? avail[avail.length - 1];
    const rung = img.rungs.find((r) => r.px === chosen)!;
    const wS = this.glWrap(slot.wrapS), wT = this.glWrap(slot.wrapT);
    const useKtx2 = format !== "webp" && !!this.ktx2 && !!rung.ktx2;
    const url = useKtx2 ? rung.ktx2! : rung.url;
    const bytes = useKtx2 ? rung.ktx2Bytes ?? rung.bytes : rung.bytes;
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
    tex.flipY = false;
    tex.wrapS = wS;
    tex.wrapT = wT;
    tex.colorSpace = space === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.channel = uvChannel(slot);
    const xf = slot?.transform;
    if (xf) {
      tex.offset.fromArray(xf.offset);
      tex.repeat.fromArray(xf.scale);
      tex.rotation = -xf.rotation;
      tex.center.set(0, 0);
    }
    tex.needsUpdate = true;
  }

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
    this.texIdle.delete(pick.key);

    const cached = this.texCache.get(pick.key);
    if (cached) { assign(cached); return Promise.resolve(); }

    let p = this.texLoading.get(pick.key);
    if (!p) {
      this.wireBytes += pick.bytes;
      const loader: { loadAsync(url: string): Promise<THREE.Texture> } =
        pick.useKtx2 && this.ktx2 ? this.ktx2 : new THREE.TextureLoader();
      p = loader
        .loadAsync(this.assetBase + pick.url)
        .then((tex) => {
          this.configureTex(tex, space, pick.wS, pick.wT, slot);
          this.texLoading.delete(pick.key);
          if ((this.texRefs.get(pick.key)?.size ?? 0) === 0) { tex.dispose(); return null; }
          this.texCache.set(pick.key, tex);
          this.texBytes.set(pick.key, textureBytes(tex));
          return tex;
        })
        .catch((e) => {
          console.error("texture load failed", pick.url, e);
          this.texLoading.delete(pick.key);
          return null;
        });
      this.texLoading.set(pick.key, p);
    }
    return p.then((t) => { if (t) assign(t); });
  }

  private releaseTextures(owner: string) {
    const keys = this.texOwned.get(owner);
    if (!keys) return;
    for (const key of keys) {
      const refs = this.texRefs.get(key);
      if (!refs) continue;
      refs.delete(owner);
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
      dressing: this.retierWanted + this.retexWanted,
      byTier,
    };
  }

  async initInstancing(): Promise<boolean> {
    if (this.instances) return true;
    if (!this.manifest.chunks.some((c) => c.inst)) return false;
    const layer = new InstanceLayer(this.scene, this.assetBase, this.loader, (matIdx) => {
      const pending: Promise<void>[] = [];
      const gate = this.cfg.transmission === "all" ? TIER_ORDER[0] : null;
      return this.buildMaterial(this.materials[matIdx], TIER_ORDER[0], "palette", pending, false, gate);
    });
    const ok = await layer.load();
    if (!ok) return false;
    if (this.disposed) { layer.dispose(); return false; }
    this.instances = layer;
    return true;
  }

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
    await this.applyMaterials(gltf.scene, TIER_ORDER[0], true, "animated");
    if (this.disposed) {
      this.releaseTextures("animated");
      this.disposeGroupFull(gltf.scene);
      return false;
    }
    this.scene.add(gltf.scene);
    this.animGroup = gltf.scene;
    this.applyNodeHiding();
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this.onMixerFinished = (e) => {
      for (const [name, action] of this.onceActions) {
        if (action === e.action) this.oncePlaying.delete(name);
      }
    };
    this.mixer.addEventListener("finished", this.onMixerFinished as never);
    this.clips = gltf.animations;
    this.buildActions();
    return gltf.animations.length > 0;
  }

  private buildActions() {
    const mixer = this.mixer;
    if (!mixer) return;
    this.loopActions = [];
    this.deferredActions.clear();
    this.onceActions.clear();
    this.oncePlaying.clear();
    for (const clip of this.clips) {
      const action = mixer.clipAction(clip);
      action.stop();
      if (this.oneShotNames.has(normaliseClip(clip.name))) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        this.onceActions.set(normaliseClip(clip.name), action);
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        this.loopActions.push(action);
        if (this.deferredNames.has(normaliseClip(clip.name))) {
          this.deferredActions.add(action);
        }
        action.play();
      }
    }
    this.applyLoopPaused();
  }

  private applyLoopPaused() {
    for (const action of this.loopActions) {
      const held = this.deferredActions.has(action) && !this.deferredRunning;
      action.paused = held || !this.loopsRunning;
    }
  }

  setDeferredClips(names: string[]) {
    const next = new Set(names.map(normaliseClip).filter(Boolean));
    if (next.size === this.deferredNames.size && [...next].every((n) => this.deferredNames.has(n))) {
      return;
    }
    this.deferredNames = next;
    if (this.mixer) this.buildActions();
  }

  setDeferredRunning(on: boolean) {
    if (this.deferredRunning === on) return;
    this.deferredRunning = on;
    this.applyLoopPaused();
  }

  animationClips(): string[] {
    return this.manifest?.animated?.clips ?? [];
  }

  setOneShotClips(names: string[]) {
    const next = new Set(names.map(normaliseClip).filter(Boolean));
    if (next.size === this.oneShotNames.size && [...next].every((n) => this.oneShotNames.has(n))) {
      return;
    }
    this.oneShotNames = next;
    if (this.mixer) {
      this.buildActions();
      this.warnUnmatched();
    }
  }

  private warnUnmatched() {
    const have = new Set(this.clips.map((c) => normaliseClip(c.name)));
    const missing = [...this.oneShotNames].filter((n) => !have.has(n));
    if (!missing.length) return;
    console.warn(
      `[stream] animation: no clip matches ${missing.join(", ")}. ` +
        `This bake carries: ${this.clips.map((c) => c.name).join(", ") || "(none)"}`,
    );
  }

  setLoopsRunning(on: boolean) {
    if (this.loopsRunning === on) return;
    this.loopsRunning = on;
    this.applyLoopPaused();
  }

  playClipOnce(name: string): boolean {
    const key = normaliseClip(name);
    const action = this.onceActions.get(key);
    if (!action) return false;
    action.reset();
    action.paused = false;
    action.play();
    this.oncePlaying.add(key);
    return true;
  }

  stopClip(name: string): boolean {
    const key = normaliseClip(name);
    const action = this.onceActions.get(key);
    if (!action) return false;
    action.stop();
    this.oncePlaying.delete(key);
    return true;
  }

  clipDuration(name: string): number | null {
    const key = normaliseClip(name);
    const action = this.onceActions.get(key) ?? this.loopActions.find((a) => normaliseClip(a.getClip().name) === key);
    return action ? action.getClip().duration : null;
  }

  isClipPlaying(name: string): boolean {
    return this.oncePlaying.has(normaliseClip(name));
  }

  updateAnimation(dt: number) {
    this.mixer?.update(dt);
  }

  instanceStats() {
    return this.instances?.stats() ?? null;
  }

  dispose() {
    this.disposed = true;
    clearStreamReach();
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
    if (this.mixer) {
      if (this.onMixerFinished) {
        this.mixer.removeEventListener("finished", this.onMixerFinished as never);
      }
      this.mixer.stopAllAction();
      if (this.animGroup) this.mixer.uncacheRoot(this.animGroup);
      this.mixer = null;
    }
    this.onMixerFinished = null;
    this.clips = [];
    this.loopActions = [];
    this.deferredActions.clear();
    this.onceActions.clear();
    this.oncePlaying.clear();
    if (this.animGroup) {
      this.scene.remove(this.animGroup);
      this.disposeGroupFull(this.animGroup);
      this.animGroup = null;
    }
    this.instances?.dispose();
    this.instances = null;
    this.ktx2?.dispose();
    this.ktx2 = null;
  }
}
