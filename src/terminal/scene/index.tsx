"use client";

/**
 * SceneContent
 * ─────────────────────────────────────────────────────────────────────────────
 * The R3F scene graph for the interior walkthrough — everything that lives
 * inside the canvas. Composed from two orchestration hooks:
 *
 *   useSceneLoading    : navmesh zone registration, model-loaded / textures-ready
 *                        count gates, per-floor minimap bounds calculation
 *   useSceneNavigation : floor switching (UI selector + blackout transition),
 *                        zone auto-sync, minimap click nav, double-click raycast nav
 *
 * Renders simultaneously for ALL floors (they coexist at different Y levels).
 * PlayerController is disabled until navReady=true so the player doesn't walk
 * before pathfinding zones are registered.
 */
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
import { HoloTwinPreview } from "@/shared/ui/screens/loading-screen/reveal";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";
import { useProgressStore } from "@/shared/stores/progress-store";
import { useCameraStore } from "@/shared/stores/camera-store";
import { tick } from "@/shared/runtime/diagnostics";
import { useWorldStore } from "@/shared/stores/world-store";
import { SHORT_MEDIA_QUERY } from "@/shared/responsive";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Reveal timeline (Smart-Loader V2 /village demo behavior):
//   - While downloading: the point cloud IS the model's silhouette from
//     frame 1 — dim and sparse at 0%, filling in (density + point size) as
//     the SMOOTHED revealProgress rises across the FULL 0→1 range. Cloud
//     density and HUD bar % read the same value, so they can never drift.
//   - Once everything is loaded AND the smoothed bar has caught up (~100%):
//     crossfadeReveal() animates sharedUniforms.uGlobalAlpha 0→1 over ~3.5s —
//     the cloud fades out and the patched mesh materials dither in, in
//     lockstep (same uniform).
// Driving density from the smoothed value (not raw progress) keeps the fill
// animated even when every byte comes straight from cache; the smoother's
// frame-delta clamp keeps a main-thread-blocking GLB parse from
// fast-forwarding it.
// REVEAL_PEAK is the smoother's cap until the model is actually ready.
const REVEAL_PEAK = 0.75;

// Per-floor preview loader. Each floor's .preview.bin is fetched in parallel
// and its Points object is added to the scene AS SOON as it resolves — not
// after Promise.all of all parts. That lets the silhouette grow alongside the
// HUD progress bar instead of popping in at 100%.
// To still look like "one whole model" the per-floor materials are driven by
// a single shared uTime / uReveal computed once per frame here, and they all
// reference the same sharedUniforms.uGlobalAlpha — so reveal and crossfade
// happen in perfect lockstep across every floor.
// Rendered outside <Suspense> so it appears while the GLBs are still loading.
// Smooths drei's raw useProgress into a monotonic, eased value and writes it
// to useProgressStore.revealProgress every frame. ONE source of truth shared
// by the HUD bar and the in-scene reveal — keeping them perfectly synced is
// the only way to avoid the user-reported "effect starts after 100% loader"
// (which happens when the bar reads raw progress and the effect reads a
// lagged smoothed value).
/** Dev-only frame counter — see diagnostics.ts. */
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

  // Read drei's loading progress imperatively inside useFrame instead of
  // subscribing reactively. Drei's `useProgress()` fires synchronously when
  // useGLTF resolves during SingleModelContent's render, which triggers a
  // "Cannot update X while rendering Y" warning. Polling once per frame is
  // fine — progress is already smoothed below.
  // The smoother uses frame-rate-independent exponential decay. The main
  // curve runs at a low rate so the reveal *feels* like it's settling
  // (time constant = 1 / BASE_RATE; at 0.8/s the smoother takes ~3.7s to
  // close ~95% of any gap). The asymptotic tail of an exponential approach
  // would normally take another 3+ seconds to close the last 1% — visible
  // as the loader sitting at 99% with cloud points still faintly glowing.
  // To kill that drag, we SWITCH to a much faster rate once the smoother
  // crosses the tail threshold AND the target is already at 1; the tail
  // collapses in well under a second. Finally we snap to exactly 1 at 0.99
  // (instead of 0.999) so the last sliver of cloud opacity disappears
  // promptly without waiting on the asymptote.
  // BASE rate matched to the Smart-Loader V2 demo's per-frame lerp
  // (displayed += (target-displayed)*0.06 @60fps ≈ 3.7/s) so the cloud fill
  // tracks the download with the same responsiveness as the /village demo.
  const BASE_DECAY_RATE  = 3.7;
  const TAIL_DECAY_RATE  = 6.0;
  const TAIL_ENTER       = 0.95;
  const SNAP_THRESHOLD   = 0.99;
  useFrame((_state, delta) => {
    if (doneRef.current) return;

    // Clamp the frame delta: a main-thread-blocking GLB parse can stall the
    // loop for seconds, and an unclamped exponential step would let the
    // smoothed value leap across the whole reveal window in that one frame —
    // skipping the cloud fill AND the dither. Capping at 1/30s means a stall
    // just pauses the animation instead of fast-forwarding it.
    const dt = Math.min(delta, 1 / 30);

    const raw = useProgress.getState().progress;
    // Unified download progress (ARCHVIZ ProgressBridge blend): the active
    // model's drei progress (eased — it's file-count based and chunky) 50/50
    // with the byte-accurate other-venue cache warm (prefetchProgress, fed by
    // interior-inline-provider). Written to the store capped at 90 — the point
    // cloud's density reads it raw, so the silhouette fills in smoothly while
    // bytes arrive; use-scene-loading writes the final 100 once mounted.
    const store = useProgressStore.getState();
    const eFrac = raw > 0 ? Math.pow(raw / 100, 1.2) : 0;
    const combined = Math.min((eFrac * 0.5 + store.prefetchProgress * 0.5) * 90, 90);
    store.setProgress(combined);
    const cap = isFurnitureToggleReadyRef.current ? 1.0 : REVEAL_PEAK - 0.01;
    // The HUD bar target reads the SAME combined value (store.progress is
    // monotonic, so use-scene-loading's final 100 also flows through here).
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

/**
 * CameraStoreBinder
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers the live R3F PerspectiveCamera with the shared `useCameraStore` so
 * UI components (FovDisc and friends) can read/mutate FOV from anywhere — the
 * store applies FOV changes directly to this camera via the ref it now holds.
 * Mounted once inside the Canvas tree. Has no rendered output.
 */
function CameraStoreBinder() {
  const { camera } = useThree();
  const setCamera = useCameraStore((s) => s.setCamera);
  useEffect(() => {
    setCamera(camera);
  }, [camera, setCamera]);
  return null;
}

// NOTE: uGlobalAlpha is animated by crossfadeReveal() (useSceneLoading) once
// everything is loaded + mounted AND the smoothed bar has caught up — exactly
// like the Smart-Loader V2 demo's revealMesh(). Its rAF loop is module-level,
// so it runs to completion even if components unmount mid-reveal; the
// firstPerson-entry snap effect and <CloudSweep/> below cover any leftover
// edge cases.

function ScenePreview({
  previewUrls,
  sharedUniforms,
  onLoaded,
}: {
  previewUrls: string[];
  sharedUniforms: SharedUniforms;
  /** Fired once every floor's Points object is in the scene. */
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
          // Hard-hide until the first progress arrives. Without this,
          // additive blending lets points contribute a faint glow at zero
          // density. preview.points.visible is toggled in useFrame the
          // moment targetReveal goes above zero.
          previews[idx].points!.visible = false;
          threeScene.add(previews[idx].points!);
          loadedCount += 1;
          // Reveal gate only releases once every floor's points are in the
          // scene; otherwise late arrivals would pop in mid-fade.
          if (loadedCount === previewUrls.length) onLoadedRef.current?.();
        })
        .catch((err: unknown) => {
          console.error("[HoloTwin] preview load failed:", err);
          if (cancelled) return;
          // Count the failure as settled — otherwise previewReady never flips
          // and useSceneLoading's gate keeps the loader up forever on a 404.
          // The reveal still runs; there's just no silhouette for this part.
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

    // Density tracks the SMOOTHED revealProgress across the FULL 0→1 range
    // (Smart-Loader V2 /village demo behavior): the silhouette is visible dim
    // and sparse from the very first percent and fills in with the HUD bar —
    // same value, so cloud and bar can never drift. The smoothing keeps the
    // fill animated even when every byte comes straight from cache.
    const targetReveal = clamp01(useProgressStore.getState().revealProgress);

    // Crossfade state comes straight from the shared uniform — animated by
    // crossfadeReveal() in useSceneLoading once everything is mounted and the
    // bar has caught up. Cloud fades out as the patched mesh materials dither
    // in (same uniform).
    // Two-stage cleanup so the cloud can't linger after the crossfade:
    //   1. Visibility-off at >= 0.9 — three.js skips the draw call entirely.
    //   2. Dispose at >= 0.95 — frees GPU geometry/material, removes the
    //      Points from the scene, then early-returns so no further uniform
    //      updates touch the (now-null) material.
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

/**
 * RevealBlurFade — fades the canvas hold-blur in lockstep with the crossfade.
 *
 * The crossfade animates sharedUniforms.uGlobalAlpha 0→1 (points fade out,
 * mesh dithers in). This driver reads the SAME uniform every frame and eases
 * the canvas filter from the hold-blur values (htl-main-revealing) down to
 * none — so the blur lifts together with the points fading and the real
 * model revealing, not as a separate step at the end.
 *
 * While driving it removes the blur classes and writes inline styles (inline
 * wins over the class, and the class's 0.4s transition would lag a per-frame
 * value). Once uGlobalAlpha reaches 1 the inline styles are cleared and the
 * revealComplete effect's htl-main-ready class takes over. Respects
 * prefers-reduced-motion (never drives — those users get no blur at all).
 */
function RevealBlurFade({ sharedUniforms }: { sharedUniforms: SharedUniforms }) {
  const { gl } = useThree();
  const driving = useRef(false);
  const done = useRef(false);
  // Must mirror the .htl-main-revealing values (globals.css) so the takeover
  // is seamless: desktop blur(10px) brightness(0.8) scale(1.02), phone 6px.
  const base = useRef({ blur: 10, bright: 0.8, scale: 1.02 });

  useEffect(() => {
    // Same two-axis condition as the stylesheet's phone block — a landscape
    // handset is caught by its HEIGHT, not its width, so matching on width
    // alone handed phones the desktop blur values mid-reveal.
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

/**
 * CloudSweep — safety net for orphaned HoloTwinPreview points.
 *
 * Runs while the cinematic-style reveal is in flight; once revealProgress hits
 * 1.0 it traverses the scene root and removes any Points object whose material
 * still references `sharedUniforms.uGlobalAlpha`. This catches edge cases where
 * ScenePreview unmounted in the middle of a load before the in-component
 * dispose path could fire (e.g. very fast load → immediate enter, or a Strict-
 * Mode double-mount race) and the points object was left attached to the scene.
 *
 * After one successful sweep it returns early on every subsequent frame — no
 * traversal cost in the steady state. The sweep is keyed off the SHARED uniform
 * itself, so it works regardless of which component originally added the cloud.
 */
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
  /** Separate dollhouse model — loaded behind HoloTwinHud on initial entry. */
  dollHouseModelUrl?: string;
  /** Point-cloud preview for the dollhouse model. */
  dollHousePreviewUrl?: string;
  firstPersonStart?: {
    position: [number, number, number];
    rotation: [number, number, number];
  } | null;
  onEnterFirstPerson?: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
  /** Fired during the last ~240 ms of the dollhouse fly-in so the blackout is
   *  already opaque when `onEnterFirstPerson` swaps the dollhouse GLB out for
   *  the streamer. */
  onTransitionCue?: () => void;
  /** True while a portal-triggered floor cinematic is running. Disables
   *  PlayerController + the auto floor-detect + the auto-teleport effect so
   *  the cinematic exclusively owns the camera and the model swap. */
  cinematicActive?: boolean;
  /** Toggles the cinematic flag (disables the player) while the portal fly runs. */
  setCinematicActive?: (v: boolean) => void;
  onLoaded: () => void;
  /** Fires whenever a model key finishes loading (dollhouse, each floor).
   *  Used by the parent to gate fade-out duration on real model readiness. */
  onModelLoaded?: (key: string) => void;
  onRevealStart?: () => void;
  onRevealDone?: () => void;
  sharedUniforms?: SharedUniforms;
  debug?: boolean;
  /** Skip point-cloud previews and canvas blur (inline/orchestrated mode) */
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

  const pathfinding = useMemo(() => new Pathfinding(), []);
  const { camera, raycaster, gl, scene } = useThree();

  // Publish the active model's world bounds (centre + radius) so the ported
  // environment (sun, shadow camera, cloud layer) fits whichever model is
  // mounted — the two models live in very different world units.
  const setWorldBounds = useWorldStore((s) => s.setBounds);

  const onRevealStart = useCallback(() => {
    onRevealStartProp?.();
  }, [onRevealStartProp]);

  // True once the whole load + reveal transition has finished (crossfade done,
  // correct model fully on screen). Until then the dollhouse camera ignores
  // all input and the canvas keeps a hold-blur — no dragging a half-revealed
  // model. Fires in every path (preview crossfade, fallback crossfade, and
  // the no-uniforms immediate path all call onRevealDone).
  const [revealComplete, setRevealComplete] = useState(false);
  const onRevealDoneRef = useRef(onRevealDone);
  onRevealDoneRef.current = onRevealDone;
  const handleRevealDone = useCallback(() => {
    setRevealComplete(true);
    onRevealDoneRef.current?.();
  }, []);

  // Single-model mounting
  // Dollhouse and first-person use the SAME model, so the key is the active
  // floor id in BOTH views. Keeping it stable means switching dollhouse ↔
  // first-person does NOT remount/re-parse the model — no black flash, no
  // re-reveal. Only the UCLA↔Stadium toggle (a real floor change) remounts.
  // Only read when the floor is NOT streamed — a streamed floor draws chunks in
  // both views now, so `dollHouseModelUrl` is dead weight for this site and
  // stays only for a site that authors no `stream` block.
  const currentModelUrl =
    viewMode === "dollhouse"
      ? (dollHouseModelUrl ?? activeFloor?.modelUrl)
      : activeFloor?.modelUrl;
  const currentModelKey = activeFloor?.id ?? "_none";

  // Adaptive streaming — BOTH views
  // One manifest feeds the overview and the walk. The dollhouse used to draw a
  // separate decimated GLB (`assets.modelUrl`); it now streams the same chunks
  // with `stream.dollhouse`, which puts every one of them on the far tier —
  // the whole district at its coarsest, ~22 MB, with the two backdrop planes
  // hidden. Adaptive banding still has nothing to give a fixed vantage that
  // frames everything, which is why that config switches the cull off and
  // flattens the tiers rather than reaching for a second asset.
  // The payoff is the transition: StreamedModel stays MOUNTED across the view
  // change and only its config swaps, so first person re-mounts the overview's
  // chunks from the decoded cache and downloads just what the near bands add.
  const streaming = !!activeFloor?.streamed;
  const walking = streaming && viewMode === "firstPerson";
  // Desktop on the first render — which is also what SSR produces, so hydration
  // is stable — then the real device profile once mounted.
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile>("desktop");
  useEffect(() => setDeviceProfile(detectProfile()), []);
  // WHICH BAKE this route streams — `v1` at /, `v2` at /v2. Every stream config
  // below is resolved against it, and so is the navmesh: the bake emits that
  // next to the chunks, so a route walking on the other variant's navmesh would
  // route over geometry it is not rendering.
  const streamVariantId = useStreamVariantId();
  const streamVariant = useStreamVariant();
  const groundStreamConfig = useMemo(
    () => resolveStreamConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  // The layout cameras are framing shots 54-412 m up and up to 2.8 km out, and
  // the bands above are tuned for someone standing in the terminal — from four
  // of the ten, they resolved 2 chunks of 831 and the shot framed empty sky.
  // `stream.aerial` is the second strategy over the same manifest; the hook
  // picks between them by camera height and hands the manager the swap. Null
  // when no aerial block is authored, in which case this is a straight
  // pass-through of the ground config.
  const aerialStreamConfig = useMemo(
    () => resolveAerialConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  const cameraStreamConfig = useStreamConfigForCamera(groundStreamConfig, aerialStreamConfig);
  // The overview is not "an elevated camera" — it is its own strategy (see the
  // `dollhouse` block in the site file), so it is selected by VIEW rather than by
  // the height hook. Absent that block, the hook's answer stands and the
  // dollhouse simply streams like any other camera up at framing height.
  const dollhouseStreamConfig = useMemo(
    () => resolveDollhouseConfig(streamVariantId, deviceProfile),
    [streamVariantId, deviceProfile],
  );
  const streamConfig =
    viewMode === "dollhouse" && dollhouseStreamConfig ? dollhouseStreamConfig : cameraStreamConfig;

  // THE NAVMESH FOLLOWS THE BAKE. It is emitted next to the chunks, so each
  // model ships its own. `scene-data/adapter.ts` now builds the node tree per
  // site and already puts the right one on the floor; this reads it off the
  // resolved variant, which is the same URL by construction. Routing over the
  // wrong bake's walkable surface would not look like a bug — it would look
  // like the floor being subtly in the wrong place.
  const navmeshUrl = streaming ? streamVariant.navmeshUrl : activeFloor?.navmeshUrl;

  // Preview point-cloud is dollhouse-only — first-person floors no longer
  // ship a preview. Past initial load we use blackouts for swaps.
  const previewUrls = useMemo(
    () => (viewMode === "dollhouse" && dollHousePreviewUrl ? [dollHousePreviewUrl] : []),
    [viewMode, dollHousePreviewUrl],
  );

  // Track whether the initial reveal has fully played once. After that,
  // ScenePreview / ProgressSmoother must NOT mount again — the reveal pipeline
  // runs ONLY on the very first load; every later swap (venue changes,
  // dollhouse re-entries) just shows the cached/parsed model directly, with
  // the blackout covering the swap.
  // Two latches:
  //   • revealComplete — the first reveal finished. Without this, switching
  //     VENUES while still in the dollhouse (never having entered first
  //     person) re-ran the whole progress-driven reveal for the new venue
  //     UNDER the blackout — a venue swap from dollhouse took seconds longer
  //     than the same swap from first person.
  //   • viewMode firstPerson — entering first person also ends the initial
  //     load story. Also prevents the firstPerson → dollhouse ScenePreview
  //     re-mount flicker (cloud at full brightness for one frame).
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

  // Canvas blur while the reveal pipeline is in flight (Smart-Loader demo
  // behavior): the cloud reads as a glowing hologram through blur(24px) +
  // brightness(0.55), then the swap below sharpens the canvas right as the
  // model is ready to dither in. Standalone + preview path only.
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

  // Progress-driven blur step-down. At REVEAL_PEAK (everything loaded, model
  // about to dither in) the heavy loading blur drops to the lighter
  // hold-blur — the crossfade plays softly veiled, and the final sharpen
  // (htl-main-ready) only lands in the revealComplete effect below, once the
  // correct model is fully on screen.
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
    gl.domElement.classList.remove("htl-main-loading", "htl-main-revealing");
    gl.domElement.classList.add("htl-main-ready");
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
    // When previews are present, useSceneLoading holds its 3.5s crossfade
    // until the smoothed bar (revealProgress) has caught up to ~100% — like
    // the Smart-Loader demo, which waits for displayedProgress ≥ 0.995
    // before revealMesh(). Without a preview it crossfades immediately.
    progressDrivenReveal: needsPreview,
    onRevealStart,
    onRevealDone: handleRevealDone,
  });

  // STABLE IDENTITY, deliberately. ModelContent lists this callback in its
  // effect dependencies, and that effect traverses the entire GLB, recomputes
  // every bounding box and re-patches every material. Passing an inline arrow
  // here re-ran all of that on every render, wrote the world store each time
  // (which always notifies, since it bumps a version), and re-rendered this
  // component straight back — an unbounded loop over a 9 MB model.
  // The volatile reads go through a ref so the callback itself never changes.
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

  // Notify parent whenever a specific model key finishes loading
  // The parent uses this to gate fade-out duration: it waits until the
  // destination model is actually in the scene tree before lowering the
  // blackout, so the user never sees the "model pops in after fade-out
  // already started" flicker that happens when the swap target hasn't
  // parsed yet.
  const onModelLoadedRef = useRef(onModelLoaded);
  onModelLoadedRef.current = onModelLoaded;
  useEffect(() => {
    if (latestLoadedKey) onModelLoadedRef.current?.(latestLoadedKey);
  }, [latestLoadedKey]);

  // Force-finalize the crossfade uniform on entering first-person
  // The progress smoother is exponential and asymptotes toward 1.0 without
  // reaching it. When the user clicks "enter" and we transition to first
  // person, the patched mesh materials' fragment shader is still discarding
  // dither pixels (uGlobalAlpha ≈ 0.96), producing a faint mottled look on
  // the model. Snap to 1.0 here so the model renders fully opaque in walk
  // mode. ScenePreview is already unmounted by viewMode gate above so the
  // cloud uniform is irrelevant — only the mesh discard matters now.
  useEffect(() => {
    if (viewMode !== "firstPerson") return;
    if (sharedUniforms) sharedUniforms.uGlobalAlpha.value = 1.0;
  }, [viewMode, sharedUniforms]);

  // Centralized furniture toggle
  // Runs whole-scene traversal whenever the active model changes (dollhouse ↔
  // first-person, or floor switches in first-person). The latched ref is
  // keyed on currentModelKey so each new model gets a fresh setup pass.
  const furnitureToggleRef = useRef<((v: boolean) => void) | null>(null);
  const furnitureSetupKey  = useRef<string | null>(null);
  const showFurnitureRef   = useRef(showFurniture);
  showFurnitureRef.current = showFurniture;

  // Shared unfurnished-materials library (per-unit). Loaded once and mounted
  // invisibly alongside every floor model so that setupFurnitureToggle can
  // pull carrier materials from it. Each floor GLB only ships its own
  // furnished sources; the unfurnished targets live here.
  const furnitureLibraryUrl = furniture?.modelUrl;
  const [furnitureLibraryLoaded, setFurnitureLibraryLoaded] = useState(false);
  const handleFurnitureLibraryLoaded = useCallback(() => {
    setFurnitureLibraryLoaded(true);
  }, []);

  useEffect(() => {
    if (!allModelsLoaded) return;
    // Wait for the GLB whose key matches the active model — onLoaded for that
    // exact key is what makes the new floor's materials actually present in
    // the scene tree. Without this gate the effect would race the GLB commit
    // and run setupFurnitureToggle against the previous floor's meshes (or
    // none at all on a cold cache), silently skipping every swap.
    if (latestLoadedKey !== currentModelKey) return;
    // Also wait for the shared unfurnished-materials library to be in the
    // scene. Without it the carrier mats are missing and every swap pair
    // resolves to "carrier NOT found" → toggle becomes a no-op.
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

    // The new floor's GLB has loaded — its materials are now in the scene tree.
    // Run setupFurnitureToggle against the fresh model: every configured swap
    // is re-resolved against the new mesh set, so each floor mount picks up
    // exactly the swaps that apply to it. Swap pairs whose source material
    // isn't in this floor's GLB are naturally skipped (the JSON config is
    // shared across all floors of the unit).
    furnitureSetupKey.current = currentModelKey;
    const toggle = setupFurnitureToggle(
      scene,
      { groups: furniture!.groups, textureSwaps: furniture!.textureSwaps },
      gl,
      camera,
    );
    furnitureToggleRef.current = toggle;
    // Apply the current toggle state immediately so the new model never
    // shows the wrong (default-from-GLB) materials for even one frame.
    toggle(showFurnitureRef.current ?? false);
    setFurnitureToggleReady(true);
  // furniture and gl/camera/scene are stable refs — the (latestLoadedKey,
  // currentModelKey, furnitureLibraryLoaded) tuple is the actual trigger
  // for re-running the swap.
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

  // Enter-interior portal cinematic
  // A FREE-camera fly (ignores the navmesh) from the live pose to the authored
  // transition camera — just outside the building's window — then a fade + model
  // swap to the interior floor. The player is disabled (cinematicActive) for the
  // whole fly; the flag is cleared UNDER the blackout (inside the swap) so the
  // new floor's player takes over unseen. Old-model GPU disposal is automatic.
  // The camera flies along a smooth Catmull-Rom ARC whose waypoints all sit
  // OUTSIDE/above the building, so it sweeps in from outside (never through the
  // model). Orientation interpolates as yaw + pitch with ROLL LOCKED TO 0, so
  // the camera can never roll/flip upside-down.
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
    const e = c.t < 0.5 ? 4 * c.t * c.t * c.t : 1 - Math.pow(-2 * c.t + 2, 3) / 2; // easeInOutCubic
    camera.position.copy(c.curve.getPoint(e));
    // Roll-free orientation: pick the keyframe segment for this arc fraction and
    // lerp yaw (shortest way) + pitch, roll fixed at 0.
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
      // Swap fires at fade-peak (under black); clear the cinematic flag there so
      // the destination floor's PlayerController activates while hidden.
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
      // Direct ground-level-ish arc: fly from the current pose THROUGH the
      // around-the-side waypoint (outside the building, at window height) to the
      // window — sweeping around the model rather than rising up and over it.
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

  // The accommodation overlay's "View the rooms" button posts the transition to
  // the nav store; consume it here (inside the canvas) so the SAME cinematic runs.
  // rAF-deferred so the store/cinematic state writes aren't synchronous in the effect.
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
      {/* Single shared smoothed progress driver. Writes to progress-store every
          frame; both HUD bar and ScenePreview read from there. Only mounted
          during the very first dollhouse load — after the user has entered
          first-person once, the reveal pipeline is done and never re-runs. */}
      <FrameCounter />
      {!skipEffects && viewMode !== "firstPerson" && !initialRevealDoneRef.current && <ProgressSmoother />}

      {/* Point-cloud preview — only during the first dollhouse load. On
          subsequent dollhouse re-entries the model is already cached/parsed
          and revealProgress is at 1.0, so re-mounting the cloud would render
          it at full brightness for one frame before self-dispose — that's the
          flicker we're avoiding. */}
      {needsPreview && viewMode !== "firstPerson" && (
        <ScenePreview
          previewUrls={previewUrls}
          sharedUniforms={sharedUniforms!}
          onLoaded={() => setPreviewLoaded(true)}
        />
      )}

      {/* Canvas blur fades in lockstep with the crossfade (same uGlobalAlpha
          the points + mesh read), instead of a hard sharpen at the end. */}
      {needsPreview && viewMode !== "firstPerson" && !revealComplete && (
        <RevealBlurFade sharedUniforms={sharedUniforms!} />
      )}

      {/* Safety net — catches any orphan preview clouds left in the scene
          after reveal completion, even if ScenePreview unmounted mid-load
          before its own dispose path could fire. Cheap: returns early on
          every frame after the first successful sweep. */}
      {sharedUniforms && <CloudSweep sharedUniforms={sharedUniforms} />}

      {/* The visible model — streamed, or a single GLB.

          STREAMED (both views of a floor that authors `stream`): hundreds of
          distance-tiered chunks driven straight onto the THREE.Scene by
          ChunkManager, plus the distance fog that lets the walking download
          radius stay small. It reports the SAME two things a GLB does (world
          bounds, "the opening view has settled"), so the navmesh, the player,
          the minimap and the environment are unchanged by the swap. ONE element
          serves both views — only `config` differs — so switching dollhouse ↔
          first person re-decides tiers against the new bands and re-mounts from
          the decoded cache instead of parsing a second model.

          What that costs the overview: no `sharedUniforms` dither and no
          edge-feather. Both patch the materials of a model that is fully
          present at mount, and a streamed one never is. The preview cloud still
          plays and still crossfades out — it just fades over solid geometry
          rather than dithering it in.

          SINGLE GLB: apartment interiors and any floor that authors no stream
          block. When the active floor authors a `boundsUrl`, the bbox callback
          is moved to the invisible bounds GLB below — same callback, same key,
          just sourced from a cleaner mesh that omits the adjacent-floor /
          staircase geometry that inflates the modelUrl bbox. */}
      {streaming ? (
        <>
          <StreamedModel
            config={streamConfig}
            onBounds={handleModelBounds}
            onLoaded={modelCallbacksFor(currentModelKey).onLoaded}
          />
          <StreamFog config={streamConfig} />
          {/* Resolution follows the frame rate. `render.maxDpr` is the ceiling
              it starts at and never exceeds; it steps DOWN when the device
              cannot hold ~20 fps and climbs back only with real headroom. It
              lives inside the `streaming` branch because its ceiling is
              per-VIEW, arriving with the same config swap the bands do.

              NOT MOUNTED AT ALL when `render.adaptiveDpr` is false, which is
              how / stays frozen at the fixed ceiling it had before this
              existed — a governor that merely never fires is not the same
              thing as no governor, because it would still take the first
              second to decide that. */}
          {streamConfig.adaptiveDpr && <AdaptiveQuality maxDpr={streamConfig.maxDpr} />}
        </>
      ) : (
        currentModelUrl && (
          <SingleModel
            key={currentModelKey}
            url={currentModelUrl}
            // Apartment-interior models load clean: no reveal-dither shader patch
            // and no diorama edge-feather — just the raw GLB, lit + shadowed. The
            // reveal pipeline / soft edges are for the village dollhouse only.
            sharedUniforms={activeFloor?.interior ? undefined : sharedUniforms}
            interior={!!activeFloor?.interior}
            onBounds={handleModelBounds}
            onLoaded={modelCallbacksFor(currentModelKey).onLoaded}
          />
        )
      )}

      {/* Optional `boundsUrl` GLB for the active floor. Mounted invisibly
          purely so its bbox can be measured for the minimap. Routes its
          bbox through the SAME modelCallbacksFor setter that the visible
          model would have used — no new path in useMinimapBounds. */}
      {viewMode === "firstPerson" && activeFloor?.boundsUrl && (
        <SingleModel
          key={`_bounds-${activeFloor.id}`}
          url={activeFloor.boundsUrl}
          visible={false}
          onBounds={modelCallbacksFor(activeFloor.id).onBounds}
        />
      )}

      {/* Shared unfurnished-materials library. Mounted invisibly for the whole
          unit lifetime so every floor model has its carrier mats available
          when setupFurnitureToggle resolves swap pairs. No sharedUniforms /
          onBounds — we don't want the reveal shader patched onto these
          meshes and they don't contribute to the visible bounds. */}
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
        />
      )}

      {debug && <PerfMeter />}

      {viewMode === "dollhouse" && (activeFloor?.dollHouseCamera ?? dollHouseCamera) && (
        <DollhouseCamera
          dollHousePosition={(activeFloor?.dollHouseCamera ?? dollHouseCamera)!.position}
          dollHouseRotation={(activeFloor?.dollHouseCamera ?? dollHouseCamera)!.rotation}
          activeFloor={activeFloor}
          // MUST match PlayerController's per-floor cameraHeight below — the fly-in
          // lands the eye at feetY + cameraHeight, and the player then holds at
          // feetY + (floor)cameraHeight. Using the node-level height here instead
          // dropped the camera by the difference right after handoff (the Y settle).
          cameraHeight={activeFloor?.cameraHeight ?? cameraHeight}
          onEnterFirstPerson={onEnterFirstPerson ?? (() => {})}
          // Raises the blackout over the tail of the fly-in. Both views now
          // stream the same chunks, so what it covers is no longer a model swap
          // but a TIER swap — the whole district at far giving way to the near
          // bands around the landing point. The blackout holds until the
          // streamer has filled that in.
          onTransitionCue={onTransitionCue}
          // Ignore all camera input (drag / wheel / pinch / double-click) until
          // the load + reveal transition has fully finished. Inline mode has no
          // reveal pipeline, so it's interactive immediately.
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
          {/* Same route the minimap draws, laid on the floor as a 3D ribbon —
              plain blue. Hidden inside apartment interiors — no pin / path there. */}
          {!activeFloor?.interior && <NavPath3D ctrlRef={playerControllerRef} />}
        </>
      )}

      {/* Resource markers — the selected resource, or the resources of the
          layout being stood at (see hotspot-markers/index.tsx). Click one to
          open its data card; travel is a list action only.

          FIRST PERSON ONLY. In the dollhouse the camera orbits the whole
          terminal from outside, where a marker is neither reachable nor
          meaningful — the beads are sized and placed to be read from their
          layout's checkpoint, so from the air they are just specks floating
          over the model. */}
      {!activeFloor?.interior && viewMode === "firstPerson" && (
        <HotspotMarkers hsSize={activeFloor?.hsSize} />
      )}

      {/* Own Suspense boundary: the env HDR + cloud texture must NOT suspend the
          whole canvas — otherwise every env/texture load unmounts + reloads the
          model and navmesh repeatedly ("site loads many times" + HUD flicker). */}
      <Suspense fallback={null}>
        <SceneEnvironment
          showEnvMap={viewMode === "firstPerson"}
          shadows={activeFloor?.shadows ?? true}
          interior={!!activeFloor?.interior}
          // Where the streamed world stops being visible, so the sun's follow
          // square is sized from the bands actually in force rather than from a
          // number in the site file that a retune would quietly invalidate. Fog
          // closes fully at its far plane; with fog off, nothing exists past
          // the unload radius.
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
