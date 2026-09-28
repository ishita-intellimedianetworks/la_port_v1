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
  progressDrivenReveal: boolean;
  onRevealStart?: () => void;
  onRevealDone?: () => void;
}

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

  const modelLoadedCount = useRef(0);
  const [allModelsLoaded, setAllModelsLoaded] = useState(false);
  const [latestLoadedKey, setLatestLoadedKey] = useState<string | null>(null);

  const { setFloorBounds, setModelBounds } = useMinimapBounds({
    activeFloor, navReady, setMinimapData,
  });

  const handleZoneReady = useCallback((floorId: string) => {
    setRegisteredFloorId(floorId);
    setNavReady(true);
  }, []);

  const { registerFloor } = useNavmeshManager({
    pathfinding,
    onReady: handleZoneReady,
  });

  useEffect(() => {
    if (registeredFloorId !== null && registeredFloorId !== activeFloor.id) {
      setNavReady(false);
    }
  }, [activeFloor.id, registeredFloorId]);

  const handleFloorGeometry = useCallback(
    (floorId: string, geo: THREE.BufferGeometry) => registerFloor(floorId, geo),
    [registerFloor],
  );

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
        onRevealStartRef.current?.();
        crossfadeReveal(su, { durationMs: 3500 }).then(() => {
          onRevealDoneRef.current?.();
        });
      }
    }
  }, [navReady, allModelsLoaded, previewReady, assetsWarmed, progressDrivenReveal, onLoaded]);

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

  const callbacksCacheRef = useRef<Record<string, ModelCallbacks>>({});
  const modelCallbacksFor = useCallback(
    (key: string): ModelCallbacks => {
      const cache = callbacksCacheRef.current;
      if (!cache[key]) {
        cache[key] = {
          onLoaded: () => {
            modelLoadedCount.current++;
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
