"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { useSite } from "@/config/context";
import { useVrBridge, type VrView } from "./bridge";
import {
  BottomBar,
  HotspotPanel,
  InstructionsPanel,
  ResourcesPanel,
} from "./ui/panels";

const DOUBLE_PRESS_MS = 450;

type Menu = "resources" | "instructions" | null;

function useDoubleTrigger(active: boolean, onDouble: () => void) {
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const held = useRef({ left: false, right: false });
  const lastPress = useRef(-Infinity);
  const onDoubleRef = useRef(onDouble);
  useLayoutEffect(() => {
    onDoubleRef.current = onDouble;
  });

  useFrame(() => {
    const now = performance.now();
    for (const [hand, source] of [["left", left], ["right", right]] as const) {
      const down = source?.gamepad?.["xr-standard-trigger"]?.state === "pressed";
      const was = held.current[hand];
      held.current[hand] = down;
      if (!down || was || !active) continue;
      if (now - lastPress.current < DOUBLE_PRESS_MS) {
        lastPress.current = -Infinity;
        onDoubleRef.current();
      } else {
        lastPress.current = now;
      }
    }
  });
}

export function VrHud() {
  const bridge = useVrBridge();
  const site = useSite();
  const [introduced, setIntroduced] = useState<ReadonlySet<VrView>>(new Set());
  const [menu, setMenu] = useState<Menu>(null);
  const view = bridge.view;
  const hotspot = view === "firstPerson" ? bridge.hotspot : null;
  const introducing = !introduced.has(view);
  const panelOpen = introducing || menu !== null || hotspot !== null;

  useDoubleTrigger(view === "dollhouse" && !panelOpen && !bridge.fadeVisible, bridge.enterHome);

  if (bridge.fadeVisible) return null;

  if (introducing || menu === "instructions") {
    return (
      <InstructionsPanel
        key={view}
        view={view}
        onDismiss={() => {
          setIntroduced((prev) => new Set(prev).add(view));
          setMenu(null);
        }}
      />
    );
  }

  if (hotspot) {
    return (
      <HotspotPanel
        key={hotspot.id}
        title={hotspot.popupTitle}
        subtitle={bridge.hotspotLayoutName}
        alert={hotspot.alert}
        fields={hotspot.fields}
        onClose={bridge.closeHotspot}
      />
    );
  }

  if (menu === "resources" && view === "firstPerson") {
    return (
      <ResourcesPanel
        groups={bridge.groups}
        label={site.ui.panels.hotspotsFlapLabel}
        onHotspot={bridge.goToHotspot}
        onClose={() => setMenu(null)}
      />
    );
  }

  return (
    <BottomBar
      view={view}
      onHome={bridge.enterHome}
      onFirstPerson={bridge.goFirstPerson}
      onDollhouse={() => {
        setMenu(null);
        bridge.goDollhouse();
      }}
      onResources={() => setMenu("resources")}
      onInstructions={() => setMenu("instructions")}
    />
  );
}
