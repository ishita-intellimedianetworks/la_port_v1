import type { MutableRefObject } from "react";
import type { Site } from "@/config";
import type { HotspotConfig } from "@/config/schema";
import { useProgressStore } from "@/shared/stores/progress-store";
import type { VrBridge, VrController, VrResourceGroup } from "./bridge";

type Vec3 = [number, number, number];
type Pose = { position: number[]; rotation: number[] };

export interface TransitionOptions {
  waitUntil?: () => boolean;
  expectedKey?: string;
}

interface TreeFloor {
  id: string;
  startPosition?: Vec3;
  startRotation?: Vec3;
  dollHouseCamera?: { position: Vec3; rotation: Vec3 };
}

interface TreeUi {
  isReady: boolean;
  showHud: boolean;
  setShowHud: (v: boolean) => void;
  othersCached: boolean;
  unitName?: string;
  phase: string;
  setPhase: (phase: "dollhouse") => void;
  fadeVisible: boolean;
  floors: TreeFloor[];
  activeFloorIndex: number;
  startPosition?: Vec3;
  startRotation?: Vec3;
  playerControllerRef: MutableRefObject<VrController | null>;
  sceneContent: {
    handleEnterFirstPerson: (p: Vec3, r: Vec3) => void;
    dollHouseCamera?: { position: Vec3; rotation: Vec3 };
    dollHousePreviewUrl?: string;
  };
}

interface NavUi {
  goHome: () => void;
  setAtHome: (v: boolean) => void;
  setHotspotInfo: (v: null) => void;
}

export function dressingSettled(): () => boolean {
  let start = -1;
  let peak = 0;
  return () => {
    if (start < 0) start = performance.now();
    const n = useProgressStore.getState().streamDressing;
    if (n > peak) peak = n;
    const elapsed = performance.now() - start;
    if (elapsed < 350) return false;
    if (elapsed >= 1500) return true;
    if (peak === 0) return true;
    return n <= Math.max(8, peak * 0.1);
  };
}

export function layoutGroups(
  site: Site,
  goToLayout: (id: string) => void,
  security: HotspotConfig[] = [],
): VrResourceGroup[] {
  const entry = (h: HotspotConfig) => ({ id: h.id, name: h.name, disabled: h.enabled === false });
  const securityGroup: VrResourceGroup[] = security.length
    ? [
        {
          id: "SECURITY",
          name: site.ui.panels.securityGroupLabel ?? "Security",
          hotspots: security.map(entry),
          travel: null,
        },
      ]
    : [];
  const layouts = site.layouts.map((layout) => ({
    id: layout.id,
    name: layout.name,
    hotspots: layout.hotspots
      .map((id) => site.hotspotById[id])
      .filter((h) => !!h)
      .map(entry),
    travel: () => goToLayout(layout.id),
  }));
  return [...securityGroup, ...layouts];
}

export function createVrBridge({
  site,
  ui,
  transition,
  navUi,
  groups,
  hotspotId,
  resolveHotspot,
  goToHotspot,
  firstPersonPose,
  onFirstPerson,
  firstPersonWait,
  onReset,
}: {
  site: Site;
  ui: TreeUi;
  transition: (swap: () => void, opts?: TransitionOptions) => void;
  navUi: NavUi;
  groups: VrResourceGroup[];
  hotspotId: string | null;
  resolveHotspot?: (id: string) => HotspotConfig | undefined;
  goToHotspot: (id: string) => void;
  firstPersonPose: Pose | null | undefined;
  onFirstPerson?: () => void;
  firstPersonWait?: () => () => boolean;
  onReset?: () => void;
}): VrBridge {
  const activeFloor = ui.floors[ui.activeFloorIndex];
  const homePosition = (activeFloor?.startPosition ?? ui.startPosition ?? [0, 0, 0]) as Vec3;
  const homeRotation = (activeFloor?.startRotation ?? ui.startRotation ?? [0, 0, 0]) as Vec3;
  const view = ui.phase === "firstPerson" ? "firstPerson" : "dollhouse";

  const goHome = () => {
    const ctrl = ui.playerControllerRef.current;
    onReset?.();
    navUi.goHome();
    const p = homePosition;
    const surfaceY = ctrl?.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    transition(() => {
      ctrl?.teleportTo([p[0], surfaceY, p[2]], homeRotation);
    });
    navUi.setAtHome(true);
  };

  const goFirstPerson = () => {
    const ctrl = ui.playerControllerRef.current;
    if (!ctrl || !firstPersonPose) return;
    onFirstPerson?.();
    const p = firstPersonPose.position as Vec3;
    const r = firstPersonPose.rotation as Vec3;
    const surfaceY = ctrl.probeFloorY(p[0], p[2], p[1]) ?? p[1];
    transition(
      () => {
        ctrl.teleportTo([p[0], surfaceY, p[2]], r);
      },
      firstPersonWait ? { waitUntil: firstPersonWait() } : undefined,
    );
  };

  const enterHome = () => {
    if (ui.phase === "firstPerson") {
      goHome();
      return;
    }
    navUi.setAtHome(true);
    ui.sceneContent.handleEnterFirstPerson(homePosition, homeRotation);
  };

  const goDollhouse = () => {
    if (ui.phase !== "firstPerson") return;
    onReset?.();
    navUi.setHotspotInfo(null);
    transition(() => ui.setPhase("dollhouse"), { expectedKey: activeFloor?.id });
  };

  const hotspot = hotspotId
    ? resolveHotspot?.(hotspotId) ??
      site.hotspotById[hotspotId] ??
      site.securityHotspotById[hotspotId] ??
      null
    : null;

  return {
    ready: ui.isReady,
    loader: {
      show: ui.showHud,
      othersCached: ui.othersCached,
      unitName: ui.unitName,
      revealVeil: !!ui.sceneContent.dollHousePreviewUrl,
      hide: () => ui.setShowHud(false),
    },
    view,
    fadeVisible: ui.fadeVisible,
    groups,
    hotspot,
    hotspotLayoutName: hotspot ? site.layoutById[hotspot.layoutId]?.name ?? null : null,
    dollhousePose: activeFloor?.dollHouseCamera ?? ui.sceneContent.dollHouseCamera ?? null,
    controller: () => ui.playerControllerRef.current,
    prepare: () => {
      if (ui.phase === "overlay") ui.setPhase("dollhouse");
    },
    enterHome,
    goDollhouse,
    goHome,
    goFirstPerson: firstPersonPose ? goFirstPerson : null,
    goToHotspot,
    closeHotspot: () => navUi.setHotspotInfo(null),
  };
}
