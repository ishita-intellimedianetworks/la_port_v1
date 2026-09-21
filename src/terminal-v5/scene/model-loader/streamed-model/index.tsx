"use client";

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

const FETCH_TIMEOUT_MS = 25_000;
const FETCH_TRIES = 4;

const STANDING_AMBIENT = ["ContainerIdle", "TruckHaul", "SceneTour"];
/** The beat between the First Person click and those clips starting. */
const STANDING_AMBIENT_DELAY_MS = 2_500;

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
  const variant = useStreamVariant();
  const assetBase = variant.assetBase;
  const mgr = useRef<ChunkManager | null>(null);
  const acc = useRef(0);

  // The construction effect must not list `config` as a dependency — it is
  // swapped in place by the effect below.
  const [managerBorn, setManagerBorn] = useState(0);

  const cfgRef = useRef(config);
  cfgRef.current = config;

  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

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
        profile: detectProfile(),
      });
      mgr.current = created;
      created.setConfig(cfgRef.current);
      setManagerBorn((n) => n + 1);

      created.initInstancing().catch((e) => console.error("[stream] palette failed", e));
      created.initAnimation().catch((e) => console.error("[stream] animation failed", e));
    })().catch((e) => console.error("[stream] manifest load failed", e));

    return () => {
      alive = false;
      mgr.current?.dispose();
      mgr.current = null;
    };
  }, [scene, gl, assetBase]);

  useEffect(() => {
    mgr.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    const hard = setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      useProgressStore.getState().setStreamProgress(1);
      onLoadedRef.current?.();
    }, 60000);
    return () => clearTimeout(hard);
  }, []);

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

  useEffect(() => {
    const m = mgr.current;
    if (!m) return;
    m.setOneShotClips(claimed);
    m.setDeferredClips(STANDING_AMBIENT);
    m.setLoopsRunning(viewMode !== "dollhouse");
  }, [claimed, viewMode, managerBorn]);

  const standingArmed = useNavUiStore((s) => s.standingAmbientArmed);
  useEffect(() => {
    if (!standingArmed) {
      mgr.current?.setDeferredRunning(false);
      return;
    }
    const t = setTimeout(() => mgr.current?.setDeferredRunning(true), STANDING_AMBIENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [standingArmed, managerBorn]);

  useEffect(() => {
    if (!selectedHotspotId || viewMode === "dollhouse") return;
    const hotspot =
      site.hotspotById[selectedHotspotId] ?? site.securityHotspotById[selectedHotspotId];
    const anim = hotspot?.animation;
    if (!anim?.clip) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const cycle = (wait: number) => {
      timer = setTimeout(() => {
        if (cancelled) return;
        // `mgr.current` rather than a captured manager: `animated.glb` lands on
        // its own schedule and the manager is rebuilt under a config swap.
        const m = mgr.current;
        if (m?.playClipOnce(anim.clip) === false) {
          console.warn(
            `[stream] animation: ${selectedHotspotId} asks for "${anim.clip}", which this bake does not carry`,
          );
          return;
        }
        if (anim.repeatSeconds == null) return;
        const duration = m?.clipDuration(anim.clip) ?? 0;
        cycle((duration + anim.repeatSeconds) * 1000);
      }, wait);
    };

    mgr.current?.stopClip(anim.clip);
    cycle(Math.max(0, (anim.delaySeconds ?? 2) * 1000));

    // Leaving cancels the whole chain rather than letting one more cycle land
    // on whatever is being looked at next.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedHotspotId, selectionSeq, site, viewMode]);

  const step = useMemo(() => 1 / config.updateHz, [config.updateHz]);

  useFrame((_, dt) => {
    const m = mgr.current;
    if (!m) return;
    m.updateAnimation(dt);

    acc.current += dt;
    if (acc.current < step) return;
    acc.current = 0;

    m.update(camera);
    const s = m.stats();
    onStatsRef.current?.(s);
    useProgressStore.getState().setStreamDressing(s.dressing);
    if (reported.current) return;

    const total = s.visible + s.loading;
    const frac = total > 0 ? s.visible / total : 0;
    if (total > 0) useProgressStore.getState().setStreamProgress(frac);

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
