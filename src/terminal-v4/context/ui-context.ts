"use client";

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
  othersCached: boolean;
  fadeVisible: boolean;
  handleFloorSelect: (i: number) => void;
  triggerFloorTransition: SceneContextValue["triggerFloorTransition"];
  playerControllerRef: SceneContextValue["playerControllerRef"];
  pendingLayoutEntryRef: SceneContextValue["pendingLayoutEntryRef"];
  sceneContent: SceneGraphData;
}

export const TerminalUiContext = createContext<TerminalUi | null>(null);

export function useTerminalUi(): TerminalUi {
  const v = useContext(TerminalUiContext);
  if (!v) throw new Error("useTerminalUi used outside TerminalProvider");
  return v;
}
