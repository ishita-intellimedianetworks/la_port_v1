"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ChunkManager, type StreamStats } from "@/streaming/chunk-manager";
import { detectProfile, type StreamingConfig } from "@/streaming/config";
import { useStreamVariant } from "@/streaming/variant";
import type { Manifest, MaterialDef, TexManifest } from "@/streaming/types";
import { useProgressStore } from "@/shared/stores/progress-store";

async function loadJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
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
