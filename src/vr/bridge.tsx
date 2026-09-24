"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { HotspotConfig } from "@/config/schema";

type Vec3 = [number, number, number];

export interface VrResourceGroup {
  id: string;
  name: string;
  hotspots: { id: string; name: string; disabled?: boolean }[];
  travel: (() => void) | null;
}

export interface VrController {
  getPosition: () => { x: number; y: number; z: number };
  getFootPosition: () => { x: number; y: number; z: number };
  getRotationY: () => number;
  teleportTo: (pos: Vec3, rot: Vec3, smooth?: boolean) => void;
  probeFloorY: (x: number, z: number, expectedY?: number) => number | null;
}

export type VrView = "dollhouse" | "firstPerson";

export interface VrLoaderState {
  show: boolean;
  othersCached: boolean;
  unitName?: string;
  revealVeil: boolean;
  hide: () => void;
}

export interface VrBridge {
  ready: boolean;
  loader: VrLoaderState;
  view: VrView;
  fadeVisible: boolean;
  groups: VrResourceGroup[];
  hotspot: HotspotConfig | null;
  hotspotLayoutName: string | null;
  dollhousePose: { position: Vec3; rotation: Vec3 } | null;
  controller: () => VrController | null;
  prepare: () => void;
  enterHome: () => void;
  goDollhouse: () => void;
  goHome: () => void;
  goFirstPerson: (() => void) | null;
  goToHotspot: (id: string) => void;
  closeHotspot: () => void;
}

const VrBridgeContext = createContext<VrBridge | null>(null);

export function VrBridgeProvider({ value, children }: { value: VrBridge; children: ReactNode }) {
  return <VrBridgeContext.Provider value={value}>{children}</VrBridgeContext.Provider>;
}

export function useVrBridge(): VrBridge {
  const v = useContext(VrBridgeContext);
  if (!v) throw new Error("useVrBridge used outside VrBridgeProvider");
  return v;
}
