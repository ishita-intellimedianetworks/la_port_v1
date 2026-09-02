"use client";

/**
 * TerminalUiContext — shared context + hook for the split interior pieces.
 */

import { createContext, useContext } from "react";
import type {
  FloorConfig,
  FurnitureConfig,
} from "@/shared/types";
import type { SceneContextValue } from "./scene-context";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";

export type Phase = "overlay" | "dollhouse" | "firstPerson";

export interface SceneGraphData {
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
  firstPersonStart: {
    position: [number, number, number];
    rotation: [number, number, number];
  } | null;
  cinematicActive: boolean;
  handleEnterFirstPerson: (
    p: [number, number, number],
    r: [number, number, number],
  ) => void;
  /** Fired during the last ~240 ms of the dollhouse fly-in, so the blackout is
   *  fully opaque by the time the camera lands and the model swap happens
   *  behind it. */
  handleTransitionCue: () => void;
  setCinematicActive: (v: boolean) => void;
  setIsModelLoaded: (v: boolean) => void;
  handleModelLoaded: (key: string) => void;
  handleRevealStart: () => void;
  handleRevealDone: () => void;
  sharedUniforms: SharedUniforms;
  debug: boolean;
  inlineMode: boolean;
}

export interface TerminalUi {
  inlineMode: boolean;
  unitName?: string;
  hasDollHouse: boolean;
  /** The /lighting dollhouse-first flow is active (see the provider prop).
   *  Overlays use it to keep venue switching available while parked in a
   *  dollhouse overview. False on / — its overlays are unchanged. */
  dollhouseFirstVisit: boolean;
  floors: FloorConfig[];
  furniture?: FurnitureConfig;
  startPosition?: [number, number, number];
  startRotation?: [number, number, number];
  phase: Phase;
  setPhase: (p: Phase) => void;
  showHud: boolean;
  setShowHud: (v: boolean) => void;
  hudFading: boolean;
  isReady: boolean;
  isMoving: boolean;
  uiEntered: boolean;
  mapEntered: boolean;
  layoutsOpen: boolean;
  setLayoutsOpen: (v: boolean) => void;
  fovOpen: boolean;
  setFovOpen: (v: boolean) => void;
  activeFloorIndex: number;
  setActiveFloorIndex: (i: number) => void;
  showFurniture: boolean;
  setShowFurniture: (v: boolean) => void;
  isFurnitureToggleReady: boolean;
  /** True once the non-initial model(s) are downloaded — the loader waits on it. */
  othersCached: boolean;
  fadeVisible: boolean;
  handleFloorSelect: (i: number) => void;
  triggerFloorTransition: SceneContextValue["triggerFloorTransition"];
  playerControllerRef: SceneContextValue["playerControllerRef"];
  pendingLayoutEntryRef: SceneContextValue["pendingLayoutEntryRef"];
  /** Plain data for the R3F children. Built fresh each provider render — read
   *  it as a value, NOT via a ref, so it can't trip React's
   *  "access ref during render" guard. */
  sceneContent: SceneGraphData;
}

export const TerminalUiContext = createContext<TerminalUi | null>(null);

export function useTerminalUi(): TerminalUi {
  const v = useContext(TerminalUiContext);
  if (!v) throw new Error("useTerminalUi used outside TerminalProvider");
  return v;
}
