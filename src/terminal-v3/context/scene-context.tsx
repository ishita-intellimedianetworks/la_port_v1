"use client";

import { createContext, useContext, type RefObject } from "react";
import type { PlayerControllerHandle } from "../scene/player";
import type { MinimapData } from "../map";
import type { FloorConfig } from "@/shared/types";

export interface SceneContextValue {
  nodeId: string;
  playerControllerRef: RefObject<PlayerControllerHandle | null>;
  activeFloor: FloorConfig;
  setActiveFloorIndex: (i: number) => void;
  minimapData: MinimapData | null;
  setMinimapData: (d: MinimapData) => void;
  isMoving: boolean;
  setIsMoving: (v: boolean) => void;
  navigateFromMinimap: (x: number, z: number) => void;
  setNavigateFromMinimap: (fn: (x: number, z: number) => void) => void;
  triggerFloorTransition: (
    onBlack: () => void,
    opts?: {
      waitForModel?: boolean;
      expectedKey?: string;
      waitUntil?: () => boolean;
    },
  ) => void;
  fadeRaise: () => void;
  fadeLower: () => void;
  showFurniture: boolean;
  setShowFurniture: (v: boolean) => void;
  isFurnitureToggleReady: boolean;
  setFurnitureToggleReady: (v: boolean) => void;
  layoutsOpen: boolean;
  setLayoutsOpen: (v: boolean) => void;
  fovOpen: boolean;
  setFovOpen: (v: boolean) => void;
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;
  viewMode: "dollhouse" | "firstPerson";
  setViewMode: (mode: "dollhouse" | "firstPerson") => void;
  pendingLayoutEntryRef: RefObject<{
    floorId:  string;
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>;
}

export const SceneContext = createContext<SceneContextValue>(null!);
export const useScene = () => useContext(SceneContext);
