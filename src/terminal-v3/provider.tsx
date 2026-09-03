"use client";

/**
 * TerminalProvider — owns interior state + lifecycle effects. Provides
 * SceneContext (for SceneContent) and TerminalUiContext (for overlays).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useGLTF } from "@react-three/drei";

import isLowPower from "@/shared/runtime";
import { useSite } from "@/config/context";
import { sceneDataFor, SITE_NODE_ID } from "@/shared/scene-data/adapter";
import {
  findNode,
  type NodeData,
  type FloorConfig,
  type FurnitureConfig,
} from "@/shared/types";

import type { PlayerControllerHandle } from "./scene/player";
import type { MinimapData } from "./map/types";
import { useFadeTransition } from "../shared/ui/screens";
import {
  getSharedUniforms,
  resetSharedUniforms,
} from "@/shared/ui/screens/loading-screen/reveal";
import { useProgressStore } from "../shared/stores/progress-store";
import { useAppStore } from "../shared/stores/app-store";
import { SceneContext, type SceneContextValue } from "./context/scene-context";
import { tokens } from "@/shared/tokens";
import {
  TerminalUiContext,
  type TerminalUi,
  type SceneGraphData,
  type Phase,
} from "./context/ui-context";

interface Props {
  /** Optional — defaults to the single configured apartment (node-id free). */
  nodeId?: string;
  inlineMode?: boolean;
  /** Whether this interior is the currently-shown scene. Retained from the
   *  orchestrated flow; always true for the standalone interior. */
  active?: boolean;
  /** /lighting flow (default off — / is unchanged): a venue switch lands in that
   *  venue's dollhouse overview until it has been entered in first person once
   *  (double-click fly-in); after that, switching to it goes straight to
   *  first person. Interior floors always enter first person directly. */
  dollhouseFirstVisit?: boolean;
  /** Per-venue floor overrides, keyed by floor id and merged field-by-field
   *  over the floor the site file projects. For a route that needs to swap a
   *  venue's model or camera WITHOUT it being a property of the model — the
   *  /lighting route uses this for the SoFi stadium delivery. A difference that
   *  belongs to the model belongs in that model's site file instead, which is
   *  where /v3's spawn moved once it had one. Pass a module-level constant —
   *  identity feeds the floors memo. Default: none. */
  floorPatches?: Record<string, Partial<FloorConfig>>;
  onReady?: () => void;
  children: ReactNode;
}

export default function TerminalProvider({
  nodeId = SITE_NODE_ID,
  inlineMode,
  active = true,
  dollhouseFirstVisit = false,
  floorPatches,
  onReady,
  children,
}: Props) {
  // Select ONLY the action. Calling useProgressStore() with no selector
  // subscribes to the whole store, and zustand's set() always produces a new
  // state object — so this component re-rendered on EVERY write, including the
  // per-frame setProgress/setRevealProgress from the reveal smoother. Because
  // the context value below is rebuilt on each render, that re-rendered the
  // entire app 60x a second and made the scene unresponsive.
  const reset = useProgressStore((s) => s.reset);
  const instructionsSeen = useAppStore((s) => s.instructionsSeen);
  const playerControllerRef = useRef<PlayerControllerHandle | null>(null);

  // The node tree is projected from the ACTIVE MODEL's file, so the floor's
  // navmesh, lights, spawn and destinations all come from the same document
  // this route streams its bake out of.
  const { nodes } = sceneDataFor(useSite());
  const node = useMemo(() => findNode(nodes as NodeData[], nodeId), [nodes, nodeId]);
  const floors        = useMemo<FloorConfig[]>(() => {
    const base = node?.floors ?? [];
    if (!floorPatches) return base;
    return base.map((f) => (floorPatches[f.id] ? { ...f, ...floorPatches[f.id] } : f));
  }, [node, floorPatches]);
  const furniture     = node?.furniture as FurnitureConfig | undefined;
  const speed         = node?.speed;
  const cameraHeight  = node?.cameraHeight;
  const startPosition = node?.startPosition;
  const startRotation = node?.startRotation;
  const dollHouseCamera     = node?.dollHouseCamera;
  const dollHouseModelUrl   = node?.dollHouseModelUrl;
  const dollHousePreviewUrl = node?.dollHousePreviewUrl;
  const hasDollHouse        = !!dollHouseCamera;
  const unitName            = node?.unitName;

  const [sharedUniforms] = useState(() => getSharedUniforms());

  const [hudFading,        setHudFading]        = useState(false);
  const [showHud,          setShowHud]          = useState(true);
  const [isModelLoaded,    setIsModelLoaded]    = useState(false);
  const [loadingDone,      setLoadingDone]      = useState(false);
  const [isMoving,         setIsMoving]         = useState(false);
  const [minimapData,      setMinimapData]      = useState<MinimapData | null>(null);
  // Default venue: the VILLAGE (floor 0) — the memorial and the rest are
  // reached through the venues tab.
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);

  const fade = useFadeTransition();
  const [cinematicActive, setCinematicActive] = useState(false);
  const [showFurniture,   setShowFurniture]   = useState(false);

  // After the single loader, show the dollhouse instructions overlay first (the
  // "overlay" phase) so the user sees how to rotate / double-click into first
  // person. Once those instructions have been seen (persisted flag), skip the
  // card and land straight in the dollhouse preview.
  const [phase, setPhase] = useState<Phase>(
    (!inlineMode && hasDollHouse)
      ? (instructionsSeen ? "dollhouse" : "overlay")
      : "firstPerson",
  );

  const [uiEntered,  setUiEntered]  = useState(false);
  const [mapEntered, setMapEntered] = useState(false);

  // True once the OTHER model(s) + navmesh bytes are in the HTTP cache. The
  // loading HUD holds until BOTH models are downloaded AND the initial (UCLA)
  // model is mounted — so the toggle later swaps from cache, not the network.
  const [othersCached, setOthersCached] = useState(false);

  const isReady    = isModelLoaded && loadingDone;
  const activeFloor = floors[activeFloorIndex];

  const viewMode: "dollhouse" | "firstPerson" =
    phase === "firstPerson" ? "firstPerson" : "dollhouse";

  const hasFurnitureTextureSwaps = !!(
    furniture?.textureSwaps && Object.keys(furniture.textureSwaps).length > 0
  );
  const [isFurnitureToggleReady, setIsFurnitureToggleReady] = useState(!hasFurnitureTextureSwaps);
  const [layoutsOpen,   setLayoutsOpen]   = useState(false);
  const [fovOpen,       setFovOpen]       = useState(false);
  const [activeRoomId,  setActiveRoomId]  = useState<string | null>(null);
  const [firstPersonStart, setFirstPersonStart] = useState<{
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>(null);

  const navigateFromMinimapRef = useRef<(x: number, z: number) => void>(() => {});
  const navigateFromMinimap    = useCallback(
    (x: number, z: number) => navigateFromMinimapRef.current(x, z), [],
  );
  const setNavigateFromMinimap = useCallback(
    (fn: (x: number, z: number) => void) => { navigateFromMinimapRef.current = fn; }, [],
  );

  const loadedModelKeyRef = useRef<string | null>(null);
  const handleModelLoaded = useCallback((key: string) => {
    loadedModelKeyRef.current = key;
  }, []);

  // Live ref to the minimap data so a transition's blackout can hold until the
  // NEW floor's minimap (floor-plan + bounds) is ready — otherwise the old map
  // lingers for a beat after the fade clears.
  const minimapDataRef = useRef(minimapData);
  minimapDataRef.current = minimapData;

  const pendingLayoutEntryRef = useRef<{
    floorId:  string;
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>(null);

  const triggerFloorTransition = useCallback(
    (
      swap: () => void,
      opts?: { waitForModel?: boolean; expectedKey?: string; expectedFloorPlanUrl?: string | null },
    ) => {
      let waitUntil: (() => boolean) | undefined;
      if (opts?.expectedKey) {
        const key = opts.expectedKey;
        const plan = opts.expectedFloorPlanUrl;
        // Reset readiness so the blackout waits for THIS fresh mount. When
        // swapping back to a previously-loaded model the ref still holds that
        // key, so the wait would pass instantly and the blackout would lower
        // before the model re-mounts — flashing the swap through (the
        // stadium→UCLA flicker). Cleared by the new mount's onModelLoaded.
        loadedModelKeyRef.current = null;
        // Also hold until the NEW floor's minimap has updated (its floor-plan is
        // set), so the fade-out reveals the new map — not the old one for a beat.
        waitUntil = () =>
          loadedModelKeyRef.current === key &&
          (!plan || minimapDataRef.current?.imageUrl === plan);
      }
      fade.transition(swap, waitUntil);
    },
    [fade],
  );

  // Venues the user has entered in first person at least once — drives the
  // dollhouseFirstVisit flow (unused when the flag is off). Ref-tracked id of
  // the active floor so the stable handleEnterFirstPerson callback can record
  // WHICH venue was entered without re-creating on floor changes.
  const exploredFloorsRef = useRef<Set<string>>(new Set());
  const activeFloorIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeFloorIdRef.current = activeFloor?.id;
  }, [activeFloor?.id]);

  /**
   * Fired by DollhouseCamera during the last ~240 ms of its fly-in, so the
   * blackout finishes going opaque exactly as the camera lands. The swap
   * itself happens in handleEnterFirstPerson below, behind it.
   */
  const handleTransitionCue = useCallback(() => { fade.raise(); }, [fade]);

  /**
   * Dollhouse -> first person.
   *
   * This used to be a bare `setPhase`, and could be: both views drew the SAME
   * GLB, so the fly-in landed on the player's eye pose and the handoff was
   * seamless. They no longer do. The dollhouse draws one decimated GLB and the
   * walking view streams chunks, so the swap tears the whole model down and
   * builds a different one — which has to happen behind black, and the black
   * has to stay up until the streamer has actually filled in around the
   * landing point. Otherwise the fade lifts onto an empty zone.
   *
   * The blackout is already opaque here (raised by the fly-in's cue); the fade
   * hook re-asserts it, runs the swap at peak, then polls `waitUntil` before
   * lowering — capped internally at MAX_BLACKOUT_WAIT_MS, so a cold or broken
   * load lands the user in a half-built scene rather than trapping them in the
   * dark. `streamProgress` is reset by StreamedModel on mount, so every entry
   * waits for its own fill.
   */
  const handleEnterFirstPerson = useCallback(
    (position: [number, number, number], rotation: [number, number, number]) => {
      if (activeFloorIdRef.current) exploredFloorsRef.current.add(activeFloorIdRef.current);
      fade.transition(
        () => {
          setFirstPersonStart({ position, rotation });
          setPhase("firstPerson");
        },
        () => useProgressStore.getState().streamProgress >= 1,
      );
    },
    [fade],
  );

  const handleRevealStart = useCallback(() => { setHudFading(true); }, []);
  const handleRevealDone  = useCallback(() => { setLoadingDone(true); }, []);

  const handleFloorSelect = useCallback(
    (i: number) => {
      if (i === activeFloorIndex) return;
      const target = floors[i];
      triggerFloorTransition(
        () => {
          setActiveFloorIndex(i);
          setFirstPersonStart(null);
          if (dollhouseFirstVisit && !target?.interior) {
            // /lighting flow: a venue not yet explored in first person opens in its
            // dollhouse overview (double-click flies in and marks it explored);
            // explored venues go straight to first person. Dollhouse-only
            // floors (the stadium) always stay in the overview.
            setPhase(
              target?.dollhouseOnly || !exploredFloorsRef.current.has(target?.id ?? "")
                ? "dollhouse"
                : "firstPerson",
            );
          } else if (target?.dollHouseCamera || target?.dollhouseOnly) {
            // Floors with their own dollhouse camera (e.g. the stadium) re-enter
            // the dollhouse overview on arrival — the swap happens under the
            // blackout, so the fade clears onto the aerial view; a double-click
            // then flies down to the floor's startPosition. Clearing
            // firstPersonStart makes that fly-in / fallback use the NEW floor's
            // start pose, not the one we just left. Floors without it (village)
            // stay straight in first-person — unchanged.
            setPhase("dollhouse");
          } else {
            // No dollhouse pose → land straight in first-person. Set it
            // explicitly so switching FROM a dollhouse-only floor (e.g. the
            // memorial) back to a walkable one doesn't stay stuck in dollhouse.
            setPhase("firstPerson");
          }
        },
        target?.id
          ? { expectedKey: target.id, expectedFloorPlanUrl: target.floorPlanUrl }
          : undefined,
      );
    },
    [activeFloorIndex, floors, triggerFloorTransition, dollhouseFirstVisit],
  );

  useEffect(() => { reset(); }, [reset]);

  // Inline (MainScene) only: when this interior stops being the active scene
  // (the user returned to the exterior), reset its per-visit state so the NEXT
  // entry always starts at floor[0] in first-person — regardless of which
  // floor / view they exited from. We key off `active` (not the app-store
  // sceneMode) because `active` flips at the swap, i.e. UNDER the full
  // blackout — so the floor swap + UI change happen out of sight. Keying off
  // sceneMode reset too early, while the interior was still visible.
  // The provider is NO LONGER keyed by nodeId (keying remounted the shared
  // Canvas/WebGL context and crashed on apartment→apartment switches), so this
  // effect is the ONLY thing that returns interior state to a clean slate
  // between visits — it therefore resets EVERYTHING the old remount used to,
  // not just the floor/phase. Node-DERIVED initials (e.g. furniture-toggle
  // readiness) are reset on nodeId-change instead — see the effect below.
  useEffect(() => {
    if (!inlineMode || active) return;
    setActiveFloorIndex(0);
    setPhase("firstPerson");
    setFirstPersonStart(null);
    setIsModelLoaded(false);
    setLoadingDone(false);
    setHudFading(false);
    setShowHud(true);
    setIsMoving(false);
    setMinimapData(null);
    setCinematicActive(false);
    setShowFurniture(false);
    setUiEntered(false);
    setMapEntered(false);
    setLayoutsOpen(false);
    setFovOpen(false);
    setActiveRoomId(null);
    setIsFurnitureToggleReady(!hasFurnitureTextureSwaps);
    loadedModelKeyRef.current = null;
    reset();
  }, [inlineMode, active, hasFurnitureTextureSwaps, reset]);

  // Reset node-DERIVED state whenever the rendered apartment changes. Without
  // the provider remount, `useState(() => …)` initialisers don't re-run, so
  // any initial value that depends on the node (here: furniture-toggle
  // readiness, which is true only when the unit has no texture swaps) would
  // otherwise carry over stale from the previously-visited apartment. Skip the
  // very first run (prevNodeIdRef seeded to the initial nodeId) so we don't
  // clobber the freshly-computed mount state.
  const prevNodeIdRef = useRef(nodeId);
  useEffect(() => {
    if (!inlineMode) return;
    if (prevNodeIdRef.current === nodeId) return;
    prevNodeIdRef.current = nodeId;
    setIsFurnitureToggleReady(!hasFurnitureTextureSwaps);
  }, [inlineMode, nodeId, hasFurnitureTextureSwaps]);

  useEffect(() => {
    if (!inlineMode) resetSharedUniforms();
  }, [inlineMode]);

  const hasPreview = !inlineMode && !!dollHousePreviewUrl;
  const isRevealComplete = useProgressStore((s) => s.revealProgress >= 0.999);
  useEffect(() => {
    if (!hasPreview) return;
    if (!isModelLoaded || !isRevealComplete) return;
    setHudFading(true);
    setLoadingDone(true);
  }, [hasPreview, isModelLoaded, isRevealComplete]);

  useEffect(() => {
    if (!inlineMode && dollHouseCamera && instructionsSeen) {
      setPhase("dollhouse");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inlineMode || !isModelLoaded) return;
    setLoadingDone(true);
    onReady?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineMode, isModelLoaded]);

  // Start the idle camera auto-rotation only AFTER the UI has finished sliding
  // in — gate on `mapEntered` (the UI entrance flag) and wait out the slide
  // duration, so the panels settle on-screen BEFORE the camera begins to drift,
  // rather than the auto-rotation kicking in while/before the UI animates.
  useEffect(() => {
    if (!isReady || phase !== "firstPerson" || !mapEntered) return;
    const t = setTimeout(
      () => playerControllerRef.current?.startIdleDrift(),
      tokens.uiEntrance.durationMs,
    );
    return () => clearTimeout(t);
  }, [isReady, phase, mapEntered]);

  // Gate the UI entrance on the scene-swap blackout having FULLY cleared
  // (sceneRevealed) — not merely on the model being loaded. On the ext→int
  // enter the model finishes loading while the blackout is still up / fading,
  // so keying off `isReady` alone slid the panels in behind/under the blackout.
  // Waiting for sceneRevealed means they slide in after the scene is visible.
  const sceneRevealed = useAppStore((s) => s.sceneRevealed);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (isReady && phase !== "overlay" && sceneRevealed) {
      t = setTimeout(() => setUiEntered(true), tokens.uiEntrance.delayMs);
    } else {
      t = setTimeout(() => setUiEntered(false), 0);
    }
    return () => clearTimeout(t);
  }, [isReady, phase, sceneRevealed]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "firstPerson" && sceneRevealed) {
      t = setTimeout(() => setMapEntered(true), tokens.uiEntrance.delayMs);
    } else {
      t = setTimeout(() => setMapEntered(false), 0);
    }
    return () => clearTimeout(t);
  }, [phase, sceneRevealed]);

  useEffect(() => {
    if (isMoving) { setFovOpen(false); setLayoutsOpen(false); }
  }, [isMoving]);

  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "true";

  // Download the OTHER model(s) + navmesh bytes into the HTTP cache during the
  // initial loading screen, and report when done via `othersCached`. The loader
  // gates on this so it only completes once BOTH models are downloaded. The
  // initial model itself is loaded (parsed + mounted) by <SingleModel>.
  // Progress is BYTE-accurate (streamed reads + content-length) and written to
  // the store's `prefetchProgress` — ProgressSmoother blends it 50/50 with the
  // active model's drei progress (ARCHVIZ ProgressBridge style), so the loader
  // bar and the point-cloud density rise smoothly through the whole download
  // instead of sitting near 0 until files complete. `assetsWarmed` mirrors
  // othersCached into the store so use-scene-loading can hold the reveal until
  // everything is down (the user then actually SEES the crossfade).
  useEffect(() => {
    const others = floors.slice(1);
    const urls = others
      .flatMap((f) => [f.modelUrl, f.navmeshUrl, f.floorPlanUrl])
      .filter((u): u is string => !!u);
    const store = useProgressStore.getState();
    if (urls.length === 0) {
      store.setPrefetchProgress(1);
      store.setAssetsWarmed(true);
      setOthersCached(true);
      return;
    }
    let cancelled = false;
    setOthersCached(false);
    const totals   = new Array<number>(urls.length).fill(0);
    const received = new Array<number>(urls.length).fill(0);
    const finished = new Array<boolean>(urls.length).fill(false);
    // Per-file fraction (bytes when content-length is known, 0/1 otherwise),
    // averaged — a smooth monotonic 0..1 across the whole warm set.
    const report = () => {
      if (cancelled) return;
      const frac =
        urls.reduce(
          (s, _, i) => s + (finished[i] ? 1 : totals[i] > 0 ? Math.min(1, received[i] / totals[i]) : 0),
          0,
        ) / urls.length;
      useProgressStore.getState().setPrefetchProgress(frac);
    };
    Promise.all(
      urls.map(async (u, i) => {
        try {
          const res = await fetch(u, { cache: "force-cache" });
          totals[i] = Number(res.headers.get("content-length") ?? 0);
          if (res.body) {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              received[i] += value?.byteLength ?? 0;
              report();
            }
          } else {
            await res.arrayBuffer();
          }
        } catch { /* non-fatal — count the file as settled either way */ }
        finished[i] = true;
        report();
      }),
    ).then(() => {
      if (cancelled) return;
      const s = useProgressStore.getState();
      s.setPrefetchProgress(1);
      s.setAssetsWarmed(true);
      setOthersCached(true);
    });
    return () => { cancelled = true; };
  }, [floors]);

  // Idle PRE-PARSE of the inactive venues' GLBs (the warm effect above only
  // gets the BYTES into the HTTP cache — the expensive part of a venue swap is
  // GLTFLoader parse + scene-graph build, which otherwise runs entirely under
  // the swap blackout, holding it for seconds). Two moments need this:
  //   • right after the initial load — every venue's FIRST swap-in;
  //   • after every swap — the outgoing venue's parsed GLTF is evicted by
  //     releaseGLTF (deliberate memory policy), so RETURNING to it re-parses.
  // Re-running on every activeFloorIndex change re-fills whichever entries
  // were just evicted. useGLTF.preload with an already-cached URL is a no-op,
  // and idle callbacks run after release's microtask-deferred eviction, so
  // this never races the dispose. Skipped on low-power devices — holding all
  // venues parsed is a real memory cost that only desktops should pay.
  useEffect(() => {
    if (!isReady || !othersCached || isLowPower()) return;
    const urls = floors
      .filter((_, i) => i !== activeFloorIndex)
      .map((f) => f.modelUrl)
      .filter((u): u is string => !!u);
    if (urls.length === 0) return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    // Small lead delay so the swap's own reveal/settle isn't competing with a
    // background parse, then one idle slot per venue.
    const handles: number[] = [];
    const timer = setTimeout(() => {
      for (const u of urls) {
        if (win.requestIdleCallback) {
          handles.push(win.requestIdleCallback(() => useGLTF.preload(u), { timeout: 8000 }));
        } else {
          useGLTF.preload(u);
        }
      }
    }, 3000);
    return () => {
      clearTimeout(timer);
      handles.forEach((h) => win.cancelIdleCallback?.(h));
    };
  }, [isReady, othersCached, activeFloorIndex, floors]);

  const interiorContextValue = useMemo<SceneContextValue>(
    () => ({
      nodeId,
      playerControllerRef,
      activeFloor,
      setActiveFloorIndex,
      minimapData,
      setMinimapData,
      isMoving,
      setIsMoving,
      navigateFromMinimap,
      setNavigateFromMinimap,
      triggerFloorTransition,
      fadeRaise: fade.raise,
      fadeLower: fade.lower,
      showFurniture,
      setShowFurniture,
      isFurnitureToggleReady,
      setFurnitureToggleReady: setIsFurnitureToggleReady,
      layoutsOpen,
      setLayoutsOpen,
      fovOpen,
      setFovOpen,
      activeRoomId,
      setActiveRoomId,
      viewMode,
      setViewMode: (mode: "dollhouse" | "firstPerson") => setPhase(mode),
      pendingLayoutEntryRef,
    }),
    [
      nodeId, activeFloor, minimapData, isMoving,
      navigateFromMinimap, setNavigateFromMinimap, triggerFloorTransition,
      fade.raise, fade.lower,
      showFurniture, isFurnitureToggleReady, layoutsOpen, fovOpen, activeRoomId, viewMode,
    ],
  );

  // MEMOISED, deliberately. Both objects go through context, so a fresh
  // identity re-renders every consumer — which is the whole overlay tree AND
  // the entire scene graph. Rebuilt each render (as this was) that turns any
  // provider state change into a full-app re-render, and turns a per-frame
  // store write into a 60fps re-render of everything.
  const sceneContent = useMemo<SceneGraphData>(
    () => ({
      floors, furniture, speed, cameraHeight, startPosition, startRotation,
      dollHouseCamera, dollHouseModelUrl, dollHousePreviewUrl,
      firstPersonStart, cinematicActive,
      handleEnterFirstPerson, handleTransitionCue,
      setCinematicActive, setIsModelLoaded,
      handleModelLoaded, handleRevealStart, handleRevealDone,
      sharedUniforms, debug, inlineMode: !!inlineMode,
    }),
    [
      floors, furniture, speed, cameraHeight, startPosition, startRotation,
      dollHouseCamera, dollHouseModelUrl, dollHousePreviewUrl,
      firstPersonStart, cinematicActive,
      handleEnterFirstPerson, handleTransitionCue,
      handleModelLoaded, handleRevealStart, handleRevealDone,
      sharedUniforms, debug, inlineMode,
    ],
  );

  const uiValue = useMemo<TerminalUi>(
    () => ({
      inlineMode: !!inlineMode,
      unitName,
      hasDollHouse,
      dollhouseFirstVisit,
      floors,
      furniture,
      startPosition,
      startRotation,
      phase, setPhase,
      showHud, setShowHud,
      hudFading,
      isReady,
      isMoving,
      uiEntered,
      mapEntered,
      layoutsOpen, setLayoutsOpen,
      fovOpen,     setFovOpen,
      activeFloorIndex, setActiveFloorIndex,
      showFurniture,    setShowFurniture,
      isFurnitureToggleReady,
      othersCached,
      fadeVisible: fade.visible,
      handleFloorSelect,
      triggerFloorTransition,
      playerControllerRef,
      pendingLayoutEntryRef,
      sceneContent,
    }),
    [
      inlineMode, unitName, hasDollHouse, dollhouseFirstVisit,
      floors, furniture, startPosition, startRotation,
      phase, showHud, hudFading, isReady, isMoving, uiEntered, mapEntered,
      layoutsOpen, fovOpen, activeFloorIndex, showFurniture,
      isFurnitureToggleReady, othersCached, fade.visible,
      handleFloorSelect, triggerFloorTransition, sceneContent,
    ],
  );

  return (
    <SceneContext.Provider value={interiorContextValue}>
      <TerminalUiContext.Provider value={uiValue}>
        {children}
      </TerminalUiContext.Provider>
    </SceneContext.Provider>
  );
}
