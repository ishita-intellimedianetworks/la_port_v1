"use client";

import { useMemo, type ReactNode } from "react";
import { useSite } from "@/config/context";
import { VrBridgeProvider } from "@/vr/bridge";
import { createVrBridge, dressingSettled, layoutGroups } from "@/vr/create-bridge";
import { useTerminalUi } from "../context/ui-context";
import { FIRST_PERSON_VIEW } from "../first-person-view";
import { useLayoutNavigation } from "../overlay/use-layout-navigation";
import { useNavUiStore } from "../stores/nav-ui-store";
import { useSecurityStore } from "../stores/security-store";

export function V5VrBridge({ children }: { children: ReactNode }) {
  const site = useSite();
  const ui = useTerminalUi();
  const { goToHotspot, goToLayout } = useLayoutNavigation();
  const hotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);
  const securityHotspots = useSecurityStore((s) => s.hotspots);
  const securityById = useSecurityStore((s) => s.hotspotById);

  const groups = useMemo(
    () => layoutGroups(site, goToLayout, securityHotspots),
    [site, goToLayout, securityHotspots],
  );

  const value = createVrBridge({
    site,
    ui,
    transition: (swap, opts) => ui.triggerFloorTransition(swap, opts),
    navUi: useNavUiStore.getState(),
    groups,
    hotspotId,
    resolveHotspot: (id) => securityById[id],
    goToHotspot: (id) => goToHotspot(id),
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
