"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";
import type { FloorConfig } from "@/shared/types";
import type { MinimapData } from "../../map/types";
import { useNavmeshManager } from "../navmesh";
import { useProgressStore } from "@/shared/stores/progress-store";
import { useMinimapBounds } from "./use-minimap-bounds";
import { crossfadeReveal } from "@/shared/ui/screens/loading-screen/reveal";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";

// ── Per-floor model callbacks ─────────────────────────────────────────────────
export interface ModelCallbacks {
  onLoaded: () => void;
  onBounds: (bbox: THREE.Box3) => void;
}

interface UseSceneLoadingOptions {
  floors: FloorConfig[];
  pathfinding: Pathfinding;
  activeFloor: FloorConfig;
  setMinimapData: (d: MinimapData) => void;
  onLoaded: () => void;
  sharedUniforms?: SharedUniforms;
  previewReady: boolean;
  /** True when the point-cloud preview path is active. The crossfade is then
   *  DEFERRED until the smoothed HUD bar (revealProgress) catches up to ~100%
   *  — Smart-Loader V2 demo behavior: the cloud finishes filling in at the
   *  bar's pace first, then the mesh dithers in over it. Without a preview
   *  the crossfade fires immediately once the gates open. */
  progressDrivenReveal: boolean;
  onRevealStart?: () => void;
  onRevealDone?: () => void;
}

/**
 * Manages loading for SceneContent:
 * - Single-floor navmesh zone registration (only the ACTIVE floor's zone
 *   exists at any time)
 * - Single-model loaded gate
 * - Delegates minimap bounds to useMinimapBounds
 * - Triggers crossfadeReveal once everything is ready, then calls onRevealDone
 */
export function useSceneLoading({
  floors: _floors,
  pathfinding,
  activeFloor,
  setMinimapData,
  onLoaded,
  sharedUniforms,
  previewReady,
  progressDrivenReveal,
  onRevealStart,
  onRevealDone,
}: UseSceneLoadingOptions) {
  void _floors;
  const [navReady, setNavReady] = useState(false);
  const [registeredFloorId, setRegisteredFloorId] = useState<string | null>(null);

  const sharedUniformsRef = useRef(sharedUniforms);
  sharedUniformsRef.current = sharedUniforms;
  const onRevealStartRef = useRef(onRevealStart);
  onRevealStartRef.current = onRevealStart;
  const onRevealDoneRef = useRef(onRevealDone);
  onRevealDoneRef.current = onRevealDone;

  // ── Model loading gate ────────────────────────────────────────────────────
  const modelLoadedCount = useRef(0);
  const [allModelsLoaded, setAllModelsLoaded] = useState(false);
  // Latest GLB key whose onLoaded has fired. Drives the furniture-toggle
  // setup in SceneContent — that effect waits for `latestLoadedKey ===
  // currentModelKey` so the swap only runs against the model that's actually
  // committed to the scene (no race with the prior floor's leftover meshes).
  const [latestLoadedKey, setLatestLoadedKey] = useState<string | null>(null);

  // ── Minimap bounds ────────────────────────────────────────────────────────
  const { setFloorBounds, setModelBounds } = useMinimapBounds({
    activeFloor, navReady, setMinimapData,
  });

  // ── Navmesh zone registration ─────────────────────────────────────────────
  // Re-register when the active floor's navmesh remounts. navReady becomes
  // false on every floor switch and flips true again once the new zone is set.
  const handleZoneReady = useCallback((floorId: string) => {
    setRegisteredFloorId(floorId);
    setNavReady(true);
  }, []);

  const { registerFloor } = useNavmeshManager({
    pathfinding,
    onReady: handleZoneReady,
  });

  // ── Floor change → invalidate navReady until the new zone registers ──────
  // The active-floor teleport effect in use-scene-navigation gates on
  // navReady; resetting it here makes that effect wait for the new floor's
  // navmesh GLB to load + register before snapping the player onto it.
  useEffect(() => {
    if (registeredFloorId !== null && registeredFloorId !== activeFloor.id) {
      setNavReady(false);
    }
  }, [activeFloor.id, registeredFloorId]);

  const handleFloorGeometry = useCallback(
    (floorId: string, geo: THREE.BufferGeometry) => registerFloor(floorId, geo),
    [registerFloor],
  );

  // ── Fire onLoaded + reveal callbacks once all gates are open ──
  // `assetsWarmed` (the other venues' byte warm, fed by the provider) is a
  // gate too — ARCHVIZ style: the crossfade only starts once the WHOLE loader
  // is about to complete, so the point cloud stays up through the download
  // and the user actually sees the model dither in as the HUD lifts.
  const assetsWarmed = useProgressStore((s) => s.assetsWarmed);
  const loadFired = useRef(false);
  useEffect(() => {
    if (!loadFired.current && navReady && allModelsLoaded && previewReady && assetsWarmed) {
      loadFired.current = true;

      const store = useProgressStore.getState();
      store.setProgress(100);
      store.setLoaded(true);
      onLoaded();

      const su = sharedUniformsRef.current;
      if (!su) {
        onRevealStartRef.current?.();
        onRevealDoneRef.current?.();
      } else if (!progressDrivenReveal) {
        // No preview cloud → fall back to the time-based crossfade: animate
        // uGlobalAlpha 0→1 over 3.5s so the patched mesh materials dither in.
        onRevealStartRef.current?.();
        crossfadeReveal(su, { durationMs: 3500 }).then(() => {
          onRevealDoneRef.current?.();
        });
      }
      // Progress-driven path (preview cloud present): setProgress(100) above
      // releases the smoother's target to 1; the deferred-crossfade effect
      // below fires once revealProgress has caught up.
    }
  }, [navReady, allModelsLoaded, previewReady, assetsWarmed, progressDrivenReveal, onLoaded]);

  // ── Deferred crossfade for the preview path (Smart-Loader demo timing) ───
  // The demo waits for its smoothed displayedProgress to reach ≥ 0.995 before
  // revealMesh(): the cloud finishes filling in at the bar's pace, holds for
  // a 300ms beat, then the mesh dithers in over 3.5s while the cloud fades
  // out (same uniform). revealProgress can't reach 0.995 before the gate
  // above fires (the smoother's target is capped below 1 until
  // setProgress(100)), so gating on it alone is safe — loadFired is checked
  // anyway for clarity.
  const revealCaughtUp = useProgressStore((s) => s.revealProgress >= 0.995);
  const crossfadeFired = useRef(false);
  useEffect(() => {
    if (!progressDrivenReveal || crossfadeFired.current) return;
    if (!loadFired.current || !revealCaughtUp) return;
    crossfadeFired.current = true;

    const su = sharedUniformsRef.current;
    if (!su) {
      onRevealStartRef.current?.();
      onRevealDoneRef.current?.();
      return;
    }
    const beat = setTimeout(() => {
      onRevealStartRef.current?.();
      crossfadeReveal(su, { durationMs: 3500 }).then(() => {
        onRevealDoneRef.current?.();
      });
    }, 300);
    return () => clearTimeout(beat);
  }, [progressDrivenReveal, revealCaughtUp]);

  // ── Stable per-key model callbacks ───────────────────────────────────────
  const callbacksCacheRef = useRef<Record<string, ModelCallbacks>>({});
  const modelCallbacksFor = useCallback(
    (key: string): ModelCallbacks => {
      const cache = callbacksCacheRef.current;
      if (!cache[key]) {
        cache[key] = {
          onLoaded: () => {
            modelLoadedCount.current++;
            // queueMicrotask defers BOTH state updates out of the GLTF effect
            // chain so React's "Cannot update X while rendering Y" warning
            // doesn't fire when downstream consumers re-render.
            queueMicrotask(() => {
              setAllModelsLoaded(true);
              setLatestLoadedKey(key);
            });
          },
          onBounds: (bbox: THREE.Box3) => {
            queueMicrotask(() => setModelBounds(key, bbox));
          },
        };
      }
      return cache[key];
    },
    [setModelBounds],
  );

  return {
    navReady,
    allModelsLoaded,
    latestLoadedKey,
    handleFloorGeometry,
    setFloorBounds,
    modelCallbacksFor,
  };
}
