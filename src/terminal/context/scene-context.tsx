"use client";

/**
 * SceneContext
 * ─────────────────────────────────────────────────────────────────────────────
 * React context that bridges TerminalExperience (HTML shell) and SceneContent (R3F canvas).
 * Because R3F components live inside a separate React renderer root, props can't
 * flow directly from canvas children back up to HTML overlays. Context solves this:
 *
 *   playerControllerRef    : imperative handle to the player — Minimap + StopButton
 *                            call navigateToPoint / stopNavigation through it
 *   activeFloor            : currently visible floor (drives minimap + floor selector)
 *   minimapData            : floor-plan image URL + world bounds → fed into <Minimap>
 *   isMoving               : true while player is walking → shows StopButton
 *   navigateFromMinimap    : stable callback registered by SceneContent, called by Minimap
 *   triggerFloorTransition : plays fade-to-black → runs swap callback → fades back
 */
import { createContext, useContext, type RefObject } from "react";
import type { PlayerControllerHandle } from "../scene/player";
import type { MinimapData } from "../map";
import type { FloorConfig } from "@/shared/types";

export interface SceneContextValue {
  /** Node ID of the apartment being shown. In standalone routes we used
   *  `useParams().nodeId` to read this, but in inlineMode (MainScene) the
   *  route is `/` with no nodeId param — context provides the single source
   *  of truth for both mount paths. */
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
    opts?: { waitForModel?: boolean; expectedKey?: string },
  ) => void;
  /** Manually raise the fade — for sequenced cinematics that control blackout timing themselves. */
  fadeRaise: () => void;
  /** Manually lower the fade — pairs with `fadeRaise`. */
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
  /** When a cross-floor layout selection is in flight, this holds the
   *  destination floor id and the exact pose the player should land at on
   *  arrival. use-scene-navigation consumes it instead of the destination
   *  floor's startPosition, then clears it. */
  pendingLayoutEntryRef: RefObject<{
    floorId:  string;
    position: [number, number, number];
    rotation: [number, number, number];
  } | null>;
}

export const SceneContext = createContext<SceneContextValue>(null!);
export const useScene = () => useContext(SceneContext);
