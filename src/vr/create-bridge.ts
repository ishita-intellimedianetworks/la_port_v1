import type { ComponentType, MutableRefObject } from "react";
import type { Site } from "@/config";
import type { HotspotConfig } from "@/config/schema";
import { useProgressStore } from "@/shared/stores/progress-store";
import type { DestinationsByCategory } from "@/shared/types";
import type { VrBridge, VrCardInfo, VrCardProps, VrController, VrMap, VrMapCategory, VrResourceGroup } from "./bridge";

type Vec3 = [number, number, number];
type Pose = { position: number[]; rotation: number[] };

export interface TransitionOptions {
  waitUntil?: () => boolean;
  expectedKey?: string;
}

interface TreeFloor {
  id: string;
  dests?: DestinationsByCategory;
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

interface MapSource {
  minimap: { imageUrl: string; bounds: VrMap["bounds"] } | null;
  categories: readonly { key: string; short: string }[];
  metersPerUnit: number;
  currentId: string | null;
}

const MAP_SKIP = new Set(["seatviews", "eventupdates"]);

let queued: (() => void) | null = null;

function destCamera(dests: DestinationsByCategory | undefined, id: string) {
  if (!dests) return null;
  for (const list of Object.values(dests)) {
    const hit = list?.find((d) => d.id === id);
    if (hit?.camera) return hit.camera;
  }
  return null;
}

function mapCategories(dests: DestinationsByCategory | undefined, categories: MapSource["categories"]): VrMapCategory[] {
  if (!dests) return [];
  return categories
    .filter((c) => !MAP_SKIP.has(c.key))
    .map((c) => {
      const list = dests[c.key as keyof DestinationsByCategory] ?? [];
      const pins = list.flatMap((dest, i) => {
        const at = dest.hotspot?.position ?? dest.camera?.position;
        if (!at) return [];
        return [{
          id: dest.id,
          num: i + 1,
          name: dest.label,
          x: at[0],
          z: at[2],
          camera: dest.camera ? { position: dest.camera.position, rotation: dest.camera.rotation } : null,
        }];
      });
      return { key: c.key, label: c.short, pins };
    })
    .filter((c) => c.pins.length > 0);
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
  card,
  Card,
  resolveHotspot,
  goToHotspot,
  firstPersonPose,
  onFirstPerson,
  firstPersonWait,
  onReset,
  mapSource,
}: {
  site: Site;
  ui: TreeUi;
  transition: (swap: () => void, opts?: TransitionOptions) => void;
  navUi: NavUi;
  groups: VrResourceGroup[];
  card: VrCardInfo | null;
  Card: ComponentType<VrCardProps>;
  resolveHotspot?: (id: string) => HotspotConfig | undefined;
  goToHotspot: (id: string) => void;
  firstPersonPose: Pose | null | undefined;
  onFirstPerson?: () => void;
  firstPersonWait?: () => () => boolean;
  onReset?: () => void;
  mapSource?: MapSource;
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

  const inFirstPerson = ui.phase === "firstPerson";

  const enterAt = (position: Vec3, rotation: Vec3, then?: () => void) => {
    navUi.setAtHome(false);
    navUi.setHotspotInfo(null);
    queued = then ?? null;
    ui.sceneContent.handleEnterFirstPerson(position, rotation);
  };

  const goFirstPerson = () => {
    if (!firstPersonPose) return;
    if (!inFirstPerson) {
      onFirstPerson?.();
      enterAt(firstPersonPose.position as Vec3, firstPersonPose.rotation as Vec3);
      return;
    }
    const ctrl = ui.playerControllerRef.current;
    if (!ctrl) return;
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

  const teleportPin: VrMap["teleport"] = (pin) => {
    if (!pin.camera) return;
    if (!inFirstPerson) {
      enterAt(pin.camera.position, pin.camera.rotation);
      return;
    }
    const ctrl = ui.playerControllerRef.current;
    if (!ctrl) return;
    const [x, y, z] = pin.camera.position;
    const surfaceY = ctrl.probeFloorY(x, z, y) ?? y;
    navUi.setHotspotInfo(null);
    transition(() => ctrl.teleportTo([x, surfaceY, z], pin.camera!.rotation));
  };
  const map: VrMap | null = mapSource?.minimap
    ? {
        imageUrl: mapSource.minimap.imageUrl,
        bounds: mapSource.minimap.bounds,
        categories: mapCategories(activeFloor?.dests, mapSource.categories),
        metersPerUnit: mapSource.metersPerUnit,
        currentId: mapSource.currentId,
        teleport: teleportPin,
      }
    : null;

  const layoutPose = (layoutId: string | undefined) =>
    (layoutId ? destCamera(activeFloor?.dests, layoutId) : null) ??
    (firstPersonPose ? { position: firstPersonPose.position as Vec3, rotation: firstPersonPose.rotation as Vec3 } : null);

  const reachableGroups = inFirstPerson
    ? groups
    : groups.map((g) => {
        const pose = g.travel ? layoutPose(g.id) : null;
        return { ...g, travel: pose ? () => enterAt(pose.position, pose.rotation) : g.travel };
      });

  const reachHotspot = (id: string) => {
    if (inFirstPerson) {
      goToHotspot(id);
      return;
    }
    const layoutId = (resolveHotspot?.(id) ?? site.hotspotById[id] ?? site.securityHotspotById[id])?.layoutId;
    const pose = layoutPose(layoutId);
    if (pose) enterAt(pose.position, pose.rotation, () => goToHotspot(id));
  };

  const hotspotId = card?.hotspotId ?? (card ? site.layoutById[card.destId]?.hotspots[card.index - 1] : undefined);
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
    groups: reachableGroups,
    hotspot,
    card: hotspot ? card : null,
    map,
    Card,
    dollhousePose: activeFloor?.dollHouseCamera ?? ui.sceneContent.dollHouseCamera ?? null,
    groundY: homePosition[1],
    controller: () => ui.playerControllerRef.current,
    prepare: () => {
      if (ui.phase === "overlay") ui.setPhase("dollhouse");
    },
    enterHome,
    goDollhouse,
    goHome,
    goFirstPerson: firstPersonPose ? goFirstPerson : null,
    goToHotspot: reachHotspot,
    runQueued: () => {
      const next = queued;
      queued = null;
      next?.();
    },
    closeHotspot: () => navUi.setHotspotInfo(null),
  };
}
