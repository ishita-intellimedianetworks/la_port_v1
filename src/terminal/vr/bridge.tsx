"use client";

import { useMemo, type ReactNode } from "react";
import { useSite } from "@/config/context";
import { VrBridgeProvider } from "@/vr/bridge";
import { createVrBridge, layoutGroups } from "@/vr/create-bridge";
import { useTerminalUi } from "../context/ui-context";
import { useLayoutNavigation } from "../overlay/use-layout-navigation";
import { useNavUiStore } from "../stores/nav-ui-store";

export function V2VrBridge({ children }: { children: ReactNode }) {
  const site = useSite();
  const ui = useTerminalUi();
  const { goToHotspot, goToLayout } = useLayoutNavigation();
  const hotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);

  const groups = useMemo(() => layoutGroups(site, goToLayout), [site, goToLayout]);

  const value = createVrBridge({
    site,
    ui,
    transition: (swap, opts) =>
      ui.triggerFloorTransition(swap, opts?.expectedKey ? { expectedKey: opts.expectedKey } : undefined),
    navUi: useNavUiStore.getState(),
    groups,
    hotspotId,
    goToHotspot: (id) => goToHotspot(id),
    firstPersonPose: site.scene.cameras.firstPerson,
  });

  return <VrBridgeProvider value={value}>{children}</VrBridgeProvider>;
}
