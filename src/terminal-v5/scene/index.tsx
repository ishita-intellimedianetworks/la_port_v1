"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { Pathfinding } from "three-pathfinding";
import * as THREE from "three";
import type { FloorConfig, FloorTransition, FurnitureConfig } from "@/shared/types";
import { useScene } from "../context/scene-context";
import { PlayerController } from "./player";
import { NavPath3D } from "./route-line";
import { HotspotMarkers } from "./hotspot-markers";
import { ZoneGeofence } from "./zone-geofence";
import { DebugAnchorHelper } from "./debug-anchor-helper";
import { WorldModels } from "./world-models";
import { SingleModel } from "./model-loader";
import { StreamedModel } from "./model-loader/streamed-model";
import {
  SingleNavmesh,
  type RoomZone,
} from "./navmesh/geometry";
import { zoneNameForFloor } from "./navmesh";
import SceneEnvironment from "./environment";
import StreamFog from "./environment/stream-fog";
import { AdaptiveQuality } from "./adaptive-quality";
import { useStreamVariant, useStreamVariantId } from "@/streaming/variant";
import {
  detectProfile,
  type DeviceProfile,
  fogRange,
  resolveAerialConfig,
  resolveDollhouseConfig,
  resolveStreamConfig,
} from "@/streaming/config";
import { useStreamConfigForCamera } from "./hooks/use-stream-config-for-camera";
import DollhouseCamera from "./dollhouse-camera";
import { PerfMeter } from "./perf-meter";
import { useSceneLoading } from "./hooks/use-scene-loading";
import { setupFurnitureToggle } from "./model-loader/furniture-swap";
import { useSceneNavigation } from "./hooks/use-scene-navigation";
import { usePortalRaycast } from "./hooks/use-portal-raycast";
import { useNavUiStore } from "../stores/nav-ui-store";
import { useDebugStore } from "../stores/debug-store";
import { HoloTwinPreview } from "@/shared/ui/screens/loading-screen/reveal";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";
import { useProgressStore } from "@/shared/stores/progress-store";
import { useCameraStore } from "@/shared/stores/camera-store";
import { tick } from "@/shared/runtime/diagnostics";
import { useWorldStore } from "@/shared/stores/world-store";
import { SHORT_MEDIA_QUERY } from "@/shared/responsive";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const REVEAL_PEAK = 0.75;

function FrameCounter() {
  useFrame(() => tick("frame"));
  return null;
}

function ProgressSmoother() {
  const { isFurnitureToggleReady } = useScene();
  const isFurnitureToggleReadyRef = useRef(isFurnitureToggleReady);
  isFurnitureToggleReadyRef.current = isFurnitureToggleReady;

  const targetRef = useRef(0);
  const smoothedRef = useRef(0);
  const doneRef = useRef(false);
  const setRevealProgress = useProgressStore((s) => s.setRevealProgress);

  const BASE_DECAY_RATE  = 3.7;
  const TAIL_DECAY_RATE  = 6.0;
  const TAIL_ENTER       = 0.95;
  const SNAP_THRESHOLD   = 0.99;
  useFrame((_state, delta) => {
    if (doneRef.current) return;

    const dt = Math.min(delta, 1 / 30);

    const raw = useProgress.getState().progress;
    const store = useProgressStore.getState();
    const eFrac = raw > 0 ? Math.pow(raw / 100, 1.2) : 0;
    const combined = Math.min((eFrac * 0.5 + store.prefetchProgress * 0.5) * 90, 90);
    store.setProgress(combined);
    const cap = isFurnitureToggleReadyRef.current ? 1.0 : REVEAL_PEAK - 0.01;
    targetRef.current = Math.max(targetRef.current, Math.min(useProgressStore.getState().progress / 100, cap));

    const inTail =
      targetRef.current >= 1 && smoothedRef.current > TAIL_ENTER;
    const rate = inTail ? TAIL_DECAY_RATE : BASE_DECAY_RATE;
    const alpha = 1 - Math.exp(-rate * dt);
    smoothedRef.current += (targetRef.current - smoothedRef.current) * alpha;
    setRevealProgress(smoothedRef.current);

    if (targetRef.current >= 1 && smoothedRef.current > SNAP_THRESHOLD) {
      smoothedRef.current = 1;
      setRevealProgress(1);
      doneRef.current = true;
    }
  });

  return null;
}

function CameraStoreBinder() {
  const { camera } = useThree();
  const setCamera = useCameraStore((s) => s.setCamera);
  useEffect(() => {
    setCamera(camera);
  }, [camera, setCamera]);
  return null;
}

function ScenePreview({
  previewUrls,
  sharedUniforms,
  onLoaded,
}: {
  previewUrls: string[];
  sharedUniforms: SharedUniforms;
  onLoaded?: () => void;
}) {
  const { scene: threeScene } = useThree();
  const previewsRef = useRef<HoloTwinPreview[]>([]);
  const startTimeRef = useRef(performance.now() / 1000);

  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const previews = previewUrls.map(() => new HoloTwinPreview(sharedUniforms));
    previewsRef.current = previews;

    previewUrls.forEach((url, idx) => {
      previews[idx]
        .loadPreview(url)
        .then(() => {
          if (cancelled || !previews[idx].points) return;
          previews[idx].points!.visible = false;
          threeScene.add(previews[idx].points!);
          loadedCount += 1;
          if (loadedCount === previewUrls.length) onLoadedRef.current?.();
        })
        .catch((err: unknown) => {
          console.error("[HoloTwin] preview load failed:", err);
          if (cancelled) return;
          loadedCount += 1;
          if (loadedCount === previewUrls.length) onLoadedRef.current?.();
        });
    });

    return () => {
      cancelled = true;
      previews.forEach((p) => p.dispose());
      previewsRef.current = [];
    };
  }, [previewUrls, sharedUniforms, threeScene]);

  useFrame(() => {
    const previews = previewsRef.current;
    if (!previews.length) return;

    const targetReveal = clamp01(useProgressStore.getState().revealProgress);

    const HIDE_THRESHOLD    = 0.90;
    const DISPOSE_THRESHOLD = 0.95;
    const alpha = sharedUniforms.uGlobalAlpha.value;

    if (alpha >= DISPOSE_THRESHOLD) {
      for (const p of previews) p.dispose();
      previewsRef.current = [];
      return;
    }

    const elapsed = performance.now() / 1000 - startTimeRef.current;
    const showPoints = targetReveal > 0.001 && alpha < HIDE_THRESHOLD;
    for (const preview of previews) {
      const mat = preview.material;
      if (!mat) continue;
      mat.uniforms.uTime.value   = elapsed;
      mat.uniforms.uReveal.value = targetReveal;
      if (preview.points) preview.points.visible = showPoints;
    }
  });

  return null;
}

function RevealBlurFade({ sharedUniforms }: { sharedUniforms: SharedUniforms }) {
  const { gl } = useThree();
  const driving = useRef(false);
  const done = useRef(false);
  const base = useRef({ blur: 10, bright: 0.8, scale: 1.02 });

  useEffect(() => {
    if (window.matchMedia(`(max-width: 640px), ${SHORT_MEDIA_QUERY}`).matches) {
      base.current = { blur: 6, bright: 0.85, scale: 1.01 };
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current = true;
    }
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    return () => {
      el.style.filter = "";
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [gl]);

  useFrame(() => {
    if (done.current) return;
    const a = sharedUniforms.uGlobalAlpha.value;
    if (a <= 0) return;

    const el = gl.domElement;
    if (!driving.current) {
      driving.current = true;
      el.classList.remove("htl-main-loading", "htl-main-revealing");
      el.style.transition = "none";
    }

    if (a >= 1) {
      el.style.filter = "";
      el.style.transform = "";
      el.style.transition = "";
      done.current = true;
      return;
    }

    const k = 1 - a;
    const b = base.current;
    el.style.filter =
      `blur(${(b.blur * k).toFixed(2)}px) ` +
      `brightness(${(b.bright + (1 - b.bright) * a).toFixed(3)}) ` +
      `saturate(${(0.95 + 0.05 * a).toFixed(3)})`;
    el.style.transform = `scale(${(1 + (b.scale - 1) * k).toFixed(4)})`;
  });

  return null;
}

function CloudSweep({ sharedUniforms }: { sharedUniforms: SharedUniforms }) {
  const { scene } = useThree();
  const sweptRef = useRef(false);

  useFrame(() => {
    if (sweptRef.current) return;
    if (sharedUniforms.uGlobalAlpha.value < 0.999) return;

    const toRemove: THREE.Points[] = [];
    scene.traverse((obj) => {
      const pts = obj as THREE.Points;
      if (!pts.isPoints) return;
      const mat = pts.material as THREE.ShaderMaterial | undefined;
      if (mat && (mat as THREE.ShaderMaterial).uniforms?.uGlobalAlpha === sharedUniforms.uGlobalAlpha) {
        toRemove.push(pts);
      }
    });

    if (toRemove.length) {
      for (const pts of toRemove) {
        if (pts.parent) pts.parent.remove(pts);
        (pts.geometry as THREE.BufferGeometry | null)?.dispose?.();
        (pts.material as THREE.Material | null)?.dispose?.();
      }
    }
    sweptRef.current = true;
  });

  return null;
}

interface SceneContentProps {
  floors: FloorConfig[];
  furniture?: FurnitureConfig;
  speed?: number;
  cameraHeight?: number;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  dollHouseCamera?: {
    position: [number, number, number];
    rotation: [number, number, number];
  };
  dollHouseModelUrl?: string;
  dollHousePreviewUrl?: string;
  firstPersonStart?: {
    position: [number, number, number];
    rotation: [number, number, number];
  } | null;
  onEnterFirstPerson?: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
  onTransitionCue?: () => void;
  cinematicActive?: boolean;
  setCinematicActive?: (v: boolean) => void;
  onLoaded: () => void;
  onModelLoaded?: (key: string) => void;
  onRevealStart?: () => void;
  onRevealDone?: () => void;
  sharedUniforms?: SharedUniforms;
  debug?: boolean;
  skipEffects?: boolean;
}

export function SceneContent({
  floors,
  furniture,
  speed,
  cameraHeight = 1.7,
  startPosition,
  startRotation,
  dollHouseCamera,
  dollHouseModelUrl,
  dollHousePreviewUrl,
  firstPersonStart,
  onEnterFirstPerson,
  onTransitionCue,
  cinematicActive = false,
  setCinematicActive,
  onLoaded,
  onModelLoaded,
  onRevealStart: onRevealStartProp,
  onRevealDone,
  sharedUniforms,
  debug,
  skipEffects,
}: SceneContentProps) {
  const {
    playerControllerRef,
    activeFloor,
    setActiveFloorIndex,
    setMinimapData,
    setIsMoving,
    setNavigateFromMinimap,
    triggerFloorTransition,
    fadeRaise,
    fadeLower,
    showFurniture,
    setFurnitureToggleReady,
    setActiveRoomId,
    viewMode,
  } = useScene();

  const showNavmesh = useDebugStore((s) => s.showNavmesh);
  const navmeshDepth = useDebugStore((s) => s.navmeshDepth);

  const pathfinding = useMemo(() => new Pathfinding(), []);
  const { camera, raycaster, gl, scene } = useThree();

  const setWorldBounds = useWorldStore((s) => s.setBounds);

  const onRevealStart = useCallback(() => {
    onRevealStartProp?.();
  }, [onRevealStartProp]);

  const [revealComplete, setRevealComplete] = useState(false);
  const onRevealDoneRef = useRef(onRevealDone);
  onRevealDoneRef.current = onRevealDone;
  const handleRevealDone = useCallback(() => {
    setRevealComplete(true);
    onRevealDoneRef.current?.();
  }, []);

  const currentModelUrl =
    viewMode === "dollhouse"
      ? (dollHouseModelUrl ?? activeFloor?.modelUrl)
      : activeFloor?.modelUrl;
  const currentModelKey = activeFloor?.id ?? "_none";

  const streaming = !!activeFloor?.streamed;
  const walking = streaming && viewMode === "firstPerson";
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>("desktop");
  useEffect(() => setDeviceProfile(detectProfile()), []);
  const streamVariantId = useStreamVariantId();
  const streamVariant = useStreamVariant();
  const groundStreamConfig = useMemo(
    () => resolveStreamConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  const aerialStreamConfig = useMemo(
    () => resolveAerialConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  const cameraStreamConfig = useStreamConfigForCamera(groundStreamConfig, aerialStreamConfig);
  const dollhouseStreamConfig = useMemo(
    () => resolveDollhouseConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  const streamConfig =
    viewMode === "dollhouse" && dollhouseStreamConfig ? dollhouseStreamConfig : cameraStreamConfig;

  const navmeshUrl = streaming ? streamVariant.navmeshUrl : activeFloor?.navmeshUrl;

  const previewUrls = useMemo(
    () => (viewMode === "dollhouse" && dollHousePreviewUrl ? [dollHousePreviewUrl] : []),
    [viewMode, dollHousePreviewUrl],
  );

  const initialRevealDoneRef = useRef(false);
  useEffect(() => {
    if (viewMode === "firstPerson" || revealComplete) initialRevealDoneRef.current = true;
  }, [viewMode, revealComplete]);

  const needsPreview =
    !skipEffects &&
    !!sharedUniforms &&
    previewUrls.length > 0 &&
    !initialRevealDoneRef.current;
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const previewReady = !needsPreview || previewLoaded;

  useEffect(() => {
    if (skipEffects || !needsPreview) return;
    gl.domElement.classList.add("htl-main-loading");
    return () =>
      gl.domElement.classList.remove(
        "htl-main-loading",
        "htl-main-revealing",
        "htl-main-ready",
      );
  }, [skipEffects, needsPreview, gl]);

  const revealPastPeak = useProgressStore(
    (s) => s.revealProgress >= REVEAL_PEAK,
  );
  useEffect(() => {
    if (skipEffects || !needsPreview || !revealPastPeak) return;
    gl.domElement.classList.remove("htl-main-loading");
    gl.domElement.classList.add("htl-main-revealing");
  }, [skipEffects, needsPreview, revealPastPeak, gl]);

  useEffect(() => {
    if (skipEffects || !revealComplete) return;
    const el = gl.domElement;
    el.classList.remove("htl-main-loading", "htl-main-revealing");
    el.classList.add("htl-main-ready");
    const t = setTimeout(() => el.classList.remove("htl-main-ready"), 450);
    return () => clearTimeout(t);
  }, [skipEffects, revealComplete, gl]);

  const roomZonesMapRef = useRef<Map<string, RoomZone[]>>(new Map());

  const {
    navReady,
    allModelsLoaded,
    latestLoadedKey,
    handleFloorGeometry: _handleFloorGeometry,
    setFloorBounds,
    modelCallbacksFor,
  } = useSceneLoading({
    floors,
    pathfinding,
    activeFloor,
    setMinimapData,
    onLoaded,
    sharedUniforms,
    previewReady,
    progressDrivenReveal: needsPreview,
    onRevealStart,
    onRevealDone: handleRevealDone,
  });

  const boundsContext = useRef({
    viewMode,
    boundsUrl: activeFloor?.boundsUrl,
    modelKey: currentModelKey,
  });
  useLayoutEffect(() => {
    boundsContext.current = {
      viewMode,
      boundsUrl: activeFloor?.boundsUrl,
      modelKey: currentModelKey,
    };
  });

  const handleModelBounds = useCallback(
    (bbox: THREE.Box3) => {
      const centre = bbox.getCenter(new THREE.Vector3());
      const radius = bbox.getSize(new THREE.Vector3()).length() * 0.5;
      setWorldBounds({
        center: [centre.x, centre.y, centre.z],
        radius,
        min: [bbox.min.x, bbox.min.y, bbox.min.z],
        max: [bbox.max.x, bbox.max.y, bbox.max.z],
      });

      const { viewMode: mode, boundsUrl, modelKey } = boundsContext.current;
      if (!(mode === "firstPerson" && boundsUrl)) {
        modelCallbacksFor(modelKey).onBounds(bbox);
      }
    },
    [setWorldBounds, modelCallbacksFor],
  );

  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;
  useEffect(() => {
    if (latestLoadedKey) onModelLoadedRef.current?.(latestLoadedKey);
  }, [latestLoadedKey]);

  useEffect(() => {
    if (viewMode !== "firstPerson") return;
    if (sharedUniforms) sharedUniforms.uGlobalAlpha.value = 1.0;
  }, [viewMode, sharedUniforms]);

  const furnitureToggleRef = useRef<((v: boolean) => void) | null>(null);
  const furnitureSetupKey  = useRef<string | null>(null);
  const showFurnitureRef   = useRef(showFurniture);
  showFurnitureRef.current = showFurniture;

  const furnitureLibraryUrl = furniture?.modelUrl;
  const [furnitureLibraryLoaded, setFurnitureLibraryLoaded] = useState(false);
  const handleFurnitureLibraryLoaded = useCallback(() => {
    setFurnitureLibraryLoaded(true);
  }, []);

  useEffect(() => {
    if (!allModelsLoaded) return;
    if (latestLoadedKey !== currentModelKey) return;
    if (furnitureLibraryUrl && !furnitureLibraryLoaded) return;
    if (furnitureSetupKey.current === currentModelKey) return;

    setFurnitureToggleReady(false);

    const hasGroups = !!furniture?.groups?.length;
    const hasSwaps  = !!(furniture?.textureSwaps && Object.keys(furniture.textureSwaps).length > 0);

    if (!hasGroups && !hasSwaps) {
      furnitureSetupKey.current = currentModelKey;
      setFurnitureToggleReady(true);
      return;
    }

    furnitureSetupKey.current = currentModelKey;
    const toggle = setupFurnitureToggle(
      scene,
      { groups: furniture!.groups, textureSwaps: furniture!.textureSwaps },
      gl,
      camera,
    );
    furnitureToggleRef.current = toggle;
    toggle(showFurnitureRef.current ?? false);
    setFurnitureToggleReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allModelsLoaded, latestLoadedKey, currentModelKey, furnitureLibraryLoaded, furnitureLibraryUrl]);

  useEffect(() => {
    furnitureToggleRef.current?.(showFurniture ?? false);
  }, [showFurniture]);

  const handleFloorGeometry = _handleFloorGeometry;

  const handleFloorBounds = useCallback(
    (floorId: string, bounds: Parameters<typeof setFloorBounds>[0][string]) => {
      setFloorBounds({ [floorId]: bounds });
    },
    [setFloorBounds],
  );

  const handleFloorRoomZones = useCallback(
    (floorId: string, zones: RoomZone[]) => {
      roomZonesMapRef.current.set(floorId, zones);
    },
    [],
  );

  const handleRoomChange = useCallback(
    (id: string | null) => {
      setActiveRoomId(id);
    },
    [setActiveRoomId],
  );

  const { handleZoneChange } = useSceneNavigation({
    floors,
    pathfinding,
    navReady,
    dblClickEnabled: viewMode === "firstPerson" && !cinematicActive,
    cinematicActive,
    playerControllerRef,
    activeFloor,
    setActiveFloorIndex,
    setNavigateFromMinimap,
    triggerFloorTransition,
    startPosition,
    startRotation,
    cameraHeight,
    gl,
    camera,
    raycaster,
    scene,
  });

  const cineRef = useRef<{
    curve: THREE.CatmullRomCurve3;
    yps: { yaw: number; pitch: number }[];
    t: number;
    dur: number;
    onDone: () => void;
  } | null>(null);

  useFrame((_, dt) => {
    const c = cineRef.current;
    if (!c) return;
    c.t = Math.min(1, c.t + dt / c.dur);
    const e = c.t < 0.5 ? 4 * c.t * c.t * c.t : 1 - Math.pow(-2 * c.t + 2, 3) / 2;
    camera.position.copy(c.curve.getPoint(e));
    const n = c.yps.length - 1;
    const f = e * n;
    const seg = Math.min(n - 1, Math.floor(f));
    const lt = f - seg;
    const a = c.yps[seg];
    const b = c.yps[seg + 1];
    let dyaw = b.yaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    camera.quaternion.setFromEuler(
      new THREE.Euler(a.pitch + (b.pitch - a.pitch) * lt, a.yaw + dyaw * lt, 0, "YXZ"),
    );
    if (c.t >= 1) {
      const done = c.onDone;
      cineRef.current = null;
      done();
    }
  });

  const enterInterior = useCallback(
    (t: FloorTransition) => {
      const idx = floors.findIndex((f) => f.id === t.targetFloorId);
      if (idx < 0) {
        console.warn(`[portal] target floor "${t.targetFloorId}" not found in floors`);
        return;
      }
      const target = floors[idx];
      const swap = () =>
        triggerFloorTransition(
          () => { setActiveFloorIndex(idx); setCinematicActive?.(false); },
          { expectedKey: target.id },
        );
      const upto = Math.min(t.swapAtCamera ?? t.cameras.length - 1, t.cameras.length - 1);
      const cams = t.cameras.slice(0, upto + 1);
      if (debug) console.log(`[portal] enterInterior → "${t.targetFloorId}" (idx ${idx}) — ${cams.length} waypoint(s)`);
      if (cams.length === 0) { swap(); return; }
      setCinematicActive?.(true);

      const toYP = (rot: [number, number, number]) => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], "XYZ"));
        const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
        return { yaw: e.y, pitch: e.x };
      };
      const startEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      const startPos = camera.position.clone();
      const positions = [
        startPos,
        ...cams.map((cm) => new THREE.Vector3(cm.position[0], cm.position[1], cm.position[2])),
      ];
      const yps = [
        { yaw: startEuler.y, pitch: startEuler.x },
        ...cams.map((cm) => toYP(cm.rotation as [number, number, number])),
      ];
      cineRef.current = {
        curve: new THREE.CatmullRomCurve3(positions, false, "catmullrom", 0.5),
        yps,
        t: 0,
        dur: 2.6,
        onDone: swap,
      };
    },
    [floors, camera, triggerFloorTransition, setActiveFloorIndex, setCinematicActive],
  );

  usePortalRaycast({
    gl, camera, raycaster, scene,
    enabled: viewMode === "firstPerson" && navReady && !cinematicActive,
    transitions: activeFloor?.transitions ?? [],
    onEnter: enterInterior,
  });

  const pendingPortal = useNavUiStore((s) => s.pendingPortal);
  useEffect(() => {
    if (!pendingPortal || viewMode !== "firstPerson" || !navReady) return;
    const raf = requestAnimationFrame(() => {
      useNavUiStore.getState().clearPortal();
      enterInterior(pendingPortal);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingPortal, viewMode, navReady, enterInterior]);

  return (
    <>
      <FrameCounter />
      {!skipEffects && viewMode !== "firstPerson" && !initialRevealDoneRef.current && <ProgressSmoother />}

      {needsPreview && viewMode !== "firstPerson" && (
        <ScenePreview
          previewUrls={previewUrls}
          sharedUniforms={sharedUniforms!}
          onLoaded={() => setPreviewLoaded(true)}
        />
      )}

      {needsPreview && viewMode !== "firstPerson" && !revealComplete && (
        <RevealBlurFade sharedUniforms={sharedUniforms!} />
      )}

      {sharedUniforms && <CloudSweep sharedUniforms={sharedUniforms} />}

      {streaming ? (
        <>
          <StreamedModel
            config={streamConfig}
            onBounds={handleModelBounds}
            onLoaded={modelCallbacksFor(currentModelKey).onLoaded}
          />
          <StreamFog config={streamConfig} />
          {streamConfig.adaptiveDpr && <AdaptiveQuality maxDpr={streamConfig.maxDpr} />}
        </>
      ) : (
        currentModelUrl && (
          <SingleModel
            key={currentModelKey}
            url={currentModelUrl}
            sharedUniforms={activeFloor?.interior ? undefined : sharedUniforms}
            interior={!!activeFloor?.interior}
            onBounds={handleModelBounds}
            onLoaded={modelCallbacksFor(currentModelKey).onLoaded}
          />
        )
      )}

      {viewMode === "firstPerson" && activeFloor?.boundsUrl && (
        <SingleModel
          key={`_bounds-${activeFloor.id}`}
          url={activeFloor.boundsUrl}
          visible={false}
          onBounds={modelCallbacksFor(activeFloor.id).onBounds}
        />
      )}

      {furnitureLibraryUrl && (
        <SingleModel
          key="_furniture-library"
          url={furnitureLibraryUrl}
          visible={false}
          onLoaded={handleFurnitureLibraryLoaded}
        />
      )}

      {activeFloor && navmeshUrl && (
        <SingleNavmesh
          key={`nav-${activeFloor.id}-${navmeshUrl}`}
          floorId={activeFloor.id}
          url={navmeshUrl}
          onGeometry={handleFloorGeometry}
          onFloorBounds={handleFloorBounds}
          onRoomZones={handleFloorRoomZones}
          debug={debug}
          show={showNavmesh}
          depthTest={navmeshDepth}
        />
      )}

      {debug && <PerfMeter />}

      {viewMode === "dollhouse" && (activeFloor?.dollHouseCamera ?? dollHouseCamera) && (
        <DollhouseCamera
          dollHousePosition={(activeFloor?.dollHouseCamera ?? dollHouseCamera)!.position}
          dollHouseRotation={(activeFloor?.dollHouseCamera ?? dollHouseCamera)!.rotation}
          activeFloor={activeFloor}
          cameraHeight={activeFloor?.cameraHeight ?? cameraHeight}
          onEnterFirstPerson={onEnterFirstPerson ?? (() => {})}
          onTransitionCue={onTransitionCue}
          interactive={skipEffects || revealComplete}
        />
      )}

      {viewMode === "firstPerson" && (
        <>
          <PlayerController
            ref={playerControllerRef}
            enabled={navReady && !cinematicActive}
            lookEnabled={!cinematicActive}
            speed={speed}
            cameraHeight={activeFloor?.cameraHeight ?? cameraHeight}
            startPosition={firstPersonStart?.position ?? activeFloor?.startPosition ?? startPosition}
            startRotation={firstPersonStart?.rotation ?? activeFloor?.startRotation ?? startRotation}
            pathfinding={pathfinding}
            initialZone={zoneNameForFloor(activeFloor?.id ?? floors[0].id)}
            onMovingChange={setIsMoving}
            onZoneChange={handleZoneChange}
            roomZonesMap={roomZonesMapRef}
            onRoomChange={handleRoomChange}
            routeSanitize={activeFloor?.routeSanitize !== false}
            debug={debug}
          />
          {!activeFloor?.interior && <NavPath3D ctrlRef={playerControllerRef} />}
        </>
      )}

      {!activeFloor?.interior && viewMode === "firstPerson" && (
        <HotspotMarkers hsSize={activeFloor?.hsSize} />
      )}

      {!activeFloor?.interior && (
        <Suspense fallback={null}>
          <WorldModels />
        </Suspense>
      )}

      {!activeFloor?.interior && viewMode === "firstPerson" && (
        <Suspense fallback={null}>
          <ZoneGeofence />
        </Suspense>
      )}

      {debug && <DebugAnchorHelper />}

      <Suspense fallback={null}>
        <SceneEnvironment
          showEnvMap={viewMode === "firstPerson"}
          shadows={activeFloor?.shadows ?? true}
          interior={!!activeFloor?.interior}
          followRadius={
            walking
              ? fogRange(streamConfig)?.far ?? streamConfig.unloadDist
              : undefined
          }
          lights={activeFloor?.lights}
          venueKey={activeFloor?.id}
        />
      </Suspense>
      <CameraStoreBinder />
    </>
  );
}
