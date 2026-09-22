"use client";

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
  nodeId?: string;
  inlineMode?: boolean;
  active?: boolean;
  dollhouseFirstVisit?: boolean;
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
  const reset = useProgressStore((s) => s.reset);
  const instructionsSeen = useAppStore((s) => s.instructionsSeen);
  const playerControllerRef = useRef<PlayerControllerHandle | null>(null);

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
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);

  const fade = useFadeTransition();
  const [cinematicActive, setCinematicActive] = useState(false);
  const [showFurniture,   setShowFurniture]   = useState(false);

  const [phase, setPhase] = useState<Phase>(
    (!inlineMode && hasDollHouse)
      ? (instructionsSeen ? "dollhouse" : "overlay")
      : "firstPerson",
  );

  const [uiEntered,  setUiEntered]  = useState(false);
  const [mapEntered, setMapEntered] = useState(false);

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
      opts?: {
        waitForModel?: boolean;
        expectedKey?: string;
        expectedFloorPlanUrl?: string | null;
        waitUntil?: () => boolean;
      },
    ) => {
      let waitUntil: (() => boolean) | undefined = opts?.waitUntil;
      if (opts?.expectedKey) {
        const key = opts.expectedKey;
        const plan = opts.expectedFloorPlanUrl;
        loadedModelKeyRef.current = null;
        const caller = opts.waitUntil;
        waitUntil = () =>
          loadedModelKeyRef.current === key &&
          (!plan || minimapDataRef.current?.imageUrl === plan) &&
          (!caller || caller());
      }
      fade.transition(swap, waitUntil);
    },
    [fade],
  );

  const exploredFloorsRef = useRef<Set<string>>(new Set());
  const activeFloorIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeFloorIdRef.current = activeFloor?.id;
  }, [activeFloor?.id]);

  const handleTransitionCue = useCallback(() => { fade.raise(); }, [fade]);

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
            setPhase(
              target?.dollhouseOnly || !exploredFloorsRef.current.has(target?.id ?? "")
                ? "dollhouse"
                : "firstPerson",
            );
          } else if (target?.dollHouseCamera || target?.dollhouseOnly) {
            setPhase("dollhouse");
          } else {
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

  useEffect(() => {
    if (!isReady || phase !== "firstPerson" || !mapEntered) return;
    const t = setTimeout(
      () => playerControllerRef.current?.startIdleDrift(),
      tokens.uiEntrance.durationMs,
    );
    return () => clearTimeout(t);
  }, [isReady, phase, mapEntered]);

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
        } catch {}
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
