"use client";

/**
 * StreamedModel — the terminal, streamed. BOTH VIEWS.
 *
 * Drop-in replacement for <SingleModel> on a floor that authors
 * `<site>.json › stream`. Same two callbacks (`onBounds`, `onLoaded`), same place
 * in the tree, so nothing downstream — navmesh, player, minimap, hotspots,
 * environment — knows the difference.
 *
 * ONE MOUNT, TWO STRATEGIES. Adaptive banding really is a bad trade from the
 * dollhouse's fixed vantage — the view cone covers everything, so the frustum
 * cull buys nothing and the bands only fight the resident-byte ceiling, whose
 * eviction drops the FURTHEST chunk first, exactly the half of the frame the
 * shot is composed around. The answer is not a second model but a second
 * config: `stream.dollhouse` flattens every chunk onto the far tier and turns
 * the cull off, which is the whole district for ~22 MB. Entering first person
 * swaps the config in place (ChunkManager.setConfig) under the entry blackout,
 * which holds until the near bands have filled in around the landing point —
 * mostly from the decoded cache, since the overview already paid for them.
 *
 * What it does NOT do, and why:
 *
 *   • It renders no JSX. `ChunkManager` owns hundreds of groups that mount and
 *     unmount many times a second; routing that through React's reconciler
 *     would cost more than the geometry. It adds them straight to the
 *     `THREE.Scene` instead, which is still `scene.children` — so every raycast
 *     in the app keeps working unchanged (see `bvh-raycast.ts` for the picking
 *     cost).
 *
 *   • It takes no `sharedUniforms`. The point-cloud → dither reveal patches the
 *     materials of a model that is fully present at mount; a streamed model
 *     never is, and its materials are rebuilt per chunk per tier for the whole
 *     session. The preview cloud still plays over it and still crossfades out —
 *     it just fades over solid geometry rather than dithering it in.
 *
 *   • It measures no bounding box. The manifest already carries the baked
 *     world bounds, so `onBounds` can fire before a single chunk has landed —
 *     which is what lets the sun, the shadow camera and the minimap frame the
 *     zone from the first frame instead of growing with the download.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSite } from "@/config/context";
import { useScene } from "../../../context/scene-context";
import { useNavUiStore } from "../../../stores/nav-ui-store";
import * as THREE from "three";
import { ChunkManager, type StreamStats } from "@/streaming/chunk-manager";
import { detectProfile, type StreamingConfig } from "@/streaming/config";
import { useStreamVariant } from "@/streaming/variant";
import type { Manifest, MaterialDef, TexManifest } from "@/streaming/types";
import { useProgressStore } from "@/shared/stores/progress-store";

/** Per attempt, not per file: the failure this exists for is a socket that
 *  CONNECTS and then delivers nothing, which `fetch` will wait on indefinitely.
 *  Generous, because manifest.json is 140 KB and a slow link is not a failure. */
const FETCH_TIMEOUT_MS = 25_000;
const FETCH_TRIES = 4;

/**
 * Fetch a manifest file, with retries.
 *
 * These three JSON files are the whole scene's critical path: `ChunkManager` is
 * not constructed until all of them land, so ONE dropped request used to mean a
 * blank terminal until the operator thought to reload. A transient timeout is
 * the likeliest failure against an object store on a shared link, and it is
 * also the one most worth surviving - the retry costs a second and the
 * alternative costs the session.
 *
 * Retries a network error or a 5xx. Does NOT retry a 4xx: a missing or
 * misspelled key will still be missing on the fourth attempt, and burning three
 * more round trips only delays the error that says so.
 */
async function loadJson<T>(url: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= FETCH_TRIES; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) {
        const err = new Error(`${url} -> ${r.status}`);
        if (r.status < 500) throw err;
        lastErr = err;
      } else {
        return (await r.json()) as T;
      }
    } catch (e) {
      // A 4xx thrown above is final; anything else is worth another go.
      if (e instanceof Error && /-> 4\d\d$/.test(e.message)) throw e;
      lastErr = e;
    }
    if (attempt < FETCH_TRIES) {
      const wait = 400 * 3 ** (attempt - 1); // 0.4s, 1.2s, 3.6s
      console.warn(
        `[stream] ${url.split("/").pop()} attempt ${attempt}/${FETCH_TRIES} failed ` +
          `(${lastErr instanceof Error ? lastErr.message : String(lastErr)}); retrying in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${url} failed`);
}

export interface StreamedModelProps {
  /** The resolved bands, from `resolveStreamConfig()`. Swapped in place rather
   *  than remounting, so a live retune (or the mobile-profile swap landing after
   *  mount) does not throw away the decoded-chunk cache. */
  config: StreamingConfig;
  /** Fires once with the manifest's baked world bounds. */
  onBounds?: (bbox: THREE.Box3) => void;
  /** Fires once, when the opening view has stopped filling in. */
  onLoaded?: () => void;
  /** Fires on every streaming tick with the live counters. Debug HUD only. */
  onStats?: (s: StreamStats) => void;
}

export function StreamedModel({ config, onBounds, onLoaded, onStats }: StreamedModelProps) {
  const { scene, camera, gl } = useThree();
  // WHICH BAKE. Each route reads its own site file and streams the `stream`
  // block in it — different manifests at different prefixes, so this decides
  // every URL below. It is in the construction effect's dep list on purpose:
  // pointing at another asset set is not a retune, it is a different model, and
  // the decoded-chunk cache from the old one is worthless against it.
  const variant = useStreamVariant();
  const assetBase = variant.assetBase;
  const mgr = useRef<ChunkManager | null>(null);
  const acc = useRef(0);

  // The construction effect must not list `config` as a dependency — it is
  // swapped in place by the effect below.
  /** Ticks each time a ChunkManager is built, so the animation-policy effect
   *  below can run against one that actually exists. Declared up here because
   *  the creation effect reads the setter. */
  const [managerBorn, setManagerBorn] = useState(0);

  const cfgRef = useRef(config);
  cfgRef.current = config;

  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  // A streamed scene is never "loaded" in the sense a GLB is — it keeps filling
  // in for as long as you walk. What the entry blackout needs to know is when
  // the LANDING view has stopped filling in, which is what these track.
  const reported = useRef(false);
  const maxVisibleSeen = useRef(0);
  const stallTicks = useRef(0);

  useEffect(() => {
    // Back to 0 for this mount. The entry blackout holds until this reaches 1,
    // so a second walk-in must wait for its own fill, not inherit the first's.
    useProgressStore.getState().resetStreamProgress();
    let alive = true;
    (async () => {
      const [manifest, materials, tex] = await Promise.all([
        loadJson<Manifest>(`${assetBase}manifest.json`),
        loadJson<MaterialDef[]>(`${assetBase}materials.json`),
        loadJson<TexManifest>(`${assetBase}tex.json`),
      ]);
      if (!alive) return;

      onBoundsRef.current?.(
        new THREE.Box3(
          new THREE.Vector3(...manifest.worldMin),
          new THREE.Vector3(...manifest.worldMax),
        ),
      );

      const created = new ChunkManager({
        scene: scene as THREE.Scene,
        assetBase,
        manifest,
        materials,
        tex,
        mode: "adaptive",
        config: cfgRef.current,
        dracoPath: "/draco/",
        renderer: gl as THREE.WebGLRenderer,
        ktx2Path: "/basis/",
        // Memory ceilings are a property of the DEVICE, not of the scene, so
        // they are resolved here rather than read from the site file's bands — and
        // they deliberately do NOT move when the aerial/ground config swaps.
        profile: detectProfile(),
      });
      mgr.current = created;
      created.setConfig(cfgRef.current);
      // Tells the animation-policy effect below that there is now something to
      // configure. A counter rather than a boolean, so a manager rebuilt under
      // a config swap re-arms it.
      setManagerBorn((n) => n + 1);

      // Both are no-ops for an asset set baked without them, and neither is
      // awaited into the critical path: the scene streams normally while the
      // palette and the crane rig download, and they appear when they land.
      created.initInstancing().catch((e) => console.error("[stream] palette failed", e));
      created.initAnimation().catch((e) => console.error("[stream] animation failed", e));
    })().catch((e) => console.error("[stream] manifest load failed", e));

    return () => {
      alive = false;
      mgr.current?.dispose();
      mgr.current = null;
    };
  }, [scene, gl, assetBase]);

  // Config swap (the mobile profile landing after mount, or a live retune):
  // re-decide every chunk against the new bands on the next tick, keeping the
  // decoded-chunk cache.
  useEffect(() => {
    mgr.current?.setConfig(config);
  }, [config]);

  // Hard safety net. Readiness normally comes from the settle test below; this
  // only covers a genuinely broken or endless load. The entry blackout has its
  // own, much shorter cap (MAX_BLACKOUT_WAIT_MS), so this is the backstop for
  // the `onLoaded` gate rather than for the black screen.
  useEffect(() => {
    const hard = setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      useProgressStore.getState().setStreamProgress(1);
      onLoadedRef.current?.();
    }, 60000);
    return () => clearTimeout(hard);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // THE ANIMATION RULES
  //
  // Three, and they are all about WHEN rather than what:
  //
  //   dollhouse      nothing moves. The overview is a still of the terminal;
  //                  cranes swinging and water rolling from 180 units up is
  //                  motion nobody asked for and a frame budget spent on
  //                  specks. Paused, not stopped, so first person picks the
  //                  water up mid-wave instead of snapping it to frame 0.
  //   first person   every ambient clip loops. This is what "reached home"
  //                  means in practice: home IS the first-person landing, and
  //                  stopping the waves again the moment the operator walks
  //                  away from it would read as a bug rather than a rule.
  //   a pick         a hotspot whose config names a clip fires it ONCE, after
  //                  its own beat. S01 opens the gate.
  //
  // The one-shot set is DERIVED: any clip a hotspot claims is a one-shot, and
  // everything else in the bake is ambient. No second list to fall out of step.
  const site = useSite();
  const { viewMode } = useScene();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  // Ticks on every pick, including a repeat of the current one, so pressing the
  // same row twice fires the clip twice.
  const selectionSeq = useNavUiStore((s) => s.selectionSeq);

  const claimed = useMemo(() => {
    const rows = [...site.hotspots, ...site.securityHotspots];
    return rows.map((h) => h.animation?.clip).filter((c): c is string => !!c);
  }, [site]);

  // THE POLICY HAS TO SURVIVE THE MANAGER ARRIVING LATE.
  //
  // `mgr.current` is null on mount - the manager is built inside an async
  // effect, after three JSON files have landed - so an effect that pushed the
  // policy only on CHANGE would push it into nothing and never run again on a
  // session where the view never changes, and the whole feature would be
  // silent. `managerBorn` ticks when one exists, which re-runs this against the
  // manager that is actually there.
  useEffect(() => {
    const m = mgr.current;
    if (!m) return;
    m.setOneShotClips(claimed);
    m.setLoopsRunning(viewMode !== "dollhouse");
  }, [claimed, viewMode, managerBorn]);

  // STOP FIRST, THEN THE BEAT, THEN PLAY FROM THE START.
  //
  // The stop is immediate and unconditional: picking a hotspot that owns a clip
  // ends whatever that clip was doing, so a gate caught half-open shuts at the
  // moment of the click rather than carrying on through the pause. Then the
  // beat - the camera lands, the operator reads the card - and only then does
  // the sequence run, once, from frame 0.
  //
  // Two hotspots share GateSequence, so picking S02 while S01's gate is running
  // restarts it rather than stacking a second playback on the same rig.
  //
  // The timer is cleared on any change of selection, so moving on before it
  // fires cancels it rather than playing the clip at whatever is being looked
  // at next.
  useEffect(() => {
    if (!selectedHotspotId) return;
    const hotspot =
      site.hotspotById[selectedHotspotId] ?? site.securityHotspotById[selectedHotspotId];
    const clip = hotspot?.animation?.clip;
    if (!clip) return;

    // `mgr.current` rather than a captured manager: `animated.glb` lands on its
    // own schedule and the manager can be rebuilt under a config swap.
    mgr.current?.stopClip(clip);

    const delay = Math.max(0, (hotspot.animation?.delaySeconds ?? 4) * 1000);
    const timer = setTimeout(() => {
      if (mgr.current?.playClipOnce(clip) === false) {
        console.warn(`[stream] animation: ${selectedHotspotId} asks for "${clip}", which this bake does not carry`);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [selectedHotspotId, selectionSeq, site]);

  const step = useMemo(() => 1 / config.updateHz, [config.updateHz]);

  useFrame((_, dt) => {
    const m = mgr.current;
    if (!m) return;
    // The crane rig runs EVERY frame, unlike the streaming update below, which
    // is deliberately throttled — stepping the mixer at 10 Hz would make the
    // cranes visibly stutter.
    //
    // Still stepped in the dollhouse: the loop set is paused there, so this
    // costs nothing, and a one-shot left mid-flight by a view change still
    // needs a clock to finish on.
    m.updateAnimation(dt);

    acc.current += dt;
    if (acc.current < step) return;
    acc.current = 0;

    m.update(camera);
    const s = m.stats();
    onStatsRef.current?.(s);
    // Published every tick, not just during the opening fill: a teleport
    // re-dresses the whole view long after `reported` has latched, and the
    // transition blackout for the bottom bar's First Person circle waits on
    // exactly this. Cheap — the store drops a write that changes nothing.
    useProgressStore.getState().setStreamDressing(s.dressing);
    if (reported.current) return;

    // `frac` is the share of the opening view that has actually landed. Chunks
    // load closest-first, so a high fraction means the near and mid scene is
    // complete and only distant stragglers are outstanding.
    const total = s.visible + s.loading;
    const frac = total > 0 ? s.visible / total : 0;
    if (total > 0) useProgressStore.getState().setStreamProgress(frac);

    // Track how long since a NEW chunk appeared. Only a stall that happens when
    // the scene is already mostly loaded counts as settled — otherwise an early
    // cold-load latency gap (first chunks land, then the bucket pauses before
    // the rest) would reveal an almost-empty zone.
    if (s.visible > maxVisibleSeen.current) {
      maxVisibleSeen.current = s.visible;
      stallTicks.current = 0;
    } else {
      stallTicks.current++;
    }
    const stalled = stallTicks.current >= Math.ceil(2.5 * config.updateHz);
    const settled = s.loading === 0 || frac >= 0.85 || (frac >= 0.6 && stalled);
    if (s.visible > 0 && settled) {
      reported.current = true;
      useProgressStore.getState().setStreamProgress(1);
      onLoadedRef.current?.();
    }
  });

  return null;
}
