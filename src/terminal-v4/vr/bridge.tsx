"use client";

import { useMemo, type ReactNode } from "react";
import { useSite } from "@/config/context";
import { VrBridgeProvider } from "@/vr/bridge";
import { createVrBridge, dressingSettled, layoutGroups } from "@/vr/create-bridge";
import { useTerminalUi } from "../context/ui-context";
import { useScene } from "../context/scene-context";
import { navConfig } from "../navigation-config";
import { FIRST_PERSON_VIEW } from "../first-person-view";
import { useLayoutNavigation } from "../overlay/use-layout-navigation";
import { useNavUiStore } from "../stores/nav-ui-store";
import { DEST_CATEGORIES } from "../overlay/destination-panel/category-meta";
import { useDestLatch } from "@/vr/dest-latch";
import { V4HotspotCard } from "./hotspot-card";
import { isFieldHotspot, useSecurityStore } from "../stores/security-store";

export function V4VrBridge({ children }: { children: ReactNode }) {
  const site = useSite();
  const ui = useTerminalUi();
  const { goToHotspot, goToLayout } = useLayoutNavigation();
  const cardDestId = useNavUiStore((s) => s.hotspotInfo?.destId ?? null);
  const cardIndex = useNavUiStore((s) => s.hotspotInfo?.index ?? 0);
  const cardHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId);
  const card = useMemo(
    () => (cardDestId ? { destId: cardDestId, index: cardIndex, hotspotId: cardHotspotId } : null),
    [cardDestId, cardIndex, cardHotspotId],
  );
  const activeFloor = ui.floors[ui.activeFloorIndex];
  const { minimapData } = useScene();
  const currentDestId = useNavUiStore((s) => s.currentDest?.id ?? null);
  useDestLatch({
    active: ui.phase === "firstPerson",
    controller: () => ui.playerControllerRef.current,
    dests: activeFloor?.dests,
    categories: DEST_CATEGORIES,
    home: activeFloor?.startPosition ?? ui.startPosition ?? [0, 0, 0],
    getStore: useNavUiStore.getState,
  });
  const securityHotspots = useSecurityStore((s) => s.hotspots);
  const securityById = useSecurityStore((s) => s.hotspotById);

  const groups = useMemo(
    () => layoutGroups(site, goToLayout, securityHotspots),
    [site, goToLayout, securityHotspots],
  );

  const openCard = (id: string) => {
    const hp = securityById[id];
    const layout = hp ? site.layoutById[hp.layoutId] : null;
    if (!hp || !layout) return;
    const siblings = securityHotspots.map((h) => h.id);
    useNavUiStore.getState().setHotspotInfo({
      destId: layout.id,
      hotspotId: hp.id,
      destLabel: layout.name,
      category: layout.zone,
      hotspotLabel: hp.name,
      index: siblings.indexOf(hp.id) + 1,
      total: siblings.length,
      position: hp.position,
    });
  };

  const value = createVrBridge({
    site,
    ui,
    transition: (swap, opts) => ui.triggerFloorTransition(swap, opts),
    navUi: useNavUiStore.getState(),
    groups,
    card,
    mapSource: {
      minimap: minimapData,
      categories: DEST_CATEGORIES,
      metersPerUnit: navConfig.logic.displayMetersPerUnit,
      currentId: currentDestId,
    },
    Card: V4HotspotCard,
    resolveHotspot: (id) => securityById[id],
    goToHotspot: (id) => goToHotspot(id, isFieldHotspot(id) ? undefined : () => openCard(id)),
    firstPersonPose: FIRST_PERSON_VIEW ?? site.scene.cameras.firstPerson,
    onFirstPerson: () => {
      useNavUiStore.getState().enterGroundView();
      useNavUiStore.getState().armStandingAmbient();
    },
    firstPersonWait: dressingSettled,
    onReset: () => useSecurityStore.getState().reset(),
  });

  return <VrBridgeProvider value={value}>{children}</VrBridgeProvider>;
}
