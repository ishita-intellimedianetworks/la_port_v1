"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { useSite } from "@/config/context";
import { useVrBridge, type VrView } from "./bridge";
import {
  BottomBar,
  InstructionsPanel,
  ResourcesPanel,
} from "./ui/panels";
import { MapPanel } from "./ui/map-panel";

const DOUBLE_PRESS_MS = 450;

type Menu = "resources" | "instructions" | "map" | null;

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

function useShowButton(active: boolean, onPress: () => void) {
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const wasDown = useRef(false);
  const onPressRef = useRef(onPress);
  useLayoutEffect(() => {
    onPressRef.current = onPress;
  });

  useFrame(() => {
    const down =
      left?.gamepad?.["y-button"]?.state === "pressed" ||
      right?.gamepad?.["b-button"]?.state === "pressed";
    if (down && !wasDown.current && active) onPressRef.current();
    wasDown.current = down;
  });
}

export function VrHud() {
  const bridge = useVrBridge();
  const site = useSite();
  const [introduced, setIntroduced] = useState<ReadonlySet<VrView>>(new Set());
  const [menu, setMenu] = useState<Menu>(null);
  const view = bridge.view;
  const [barHidden, setBarHidden] = useState(false);
  const [lastView, setLastView] = useState(view);
  if (lastView !== view) {
    setLastView(view);
    setBarHidden(false);
  }
  const card = view === "firstPerson" ? bridge.card : null;
  const introducing = !introduced.has(view);
  const panelOpen = introducing || menu !== null || card !== null;

  useDoubleTrigger(view === "dollhouse" && !panelOpen && !bridge.fadeVisible, bridge.enterHome);
  useShowButton(barHidden, () => setBarHidden(false));

  const runQueued = bridge.runQueued;
  const settledInFirstPerson = view === "firstPerson" && !bridge.fadeVisible;
  useEffect(() => {
    if (settledInFirstPerson) runQueued();
  }, [settledInFirstPerson, runQueued]);

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

  if (card) {
    const Card = bridge.Card;
    return <Card key={card.hotspotId ?? `${card.destId}:${card.index}`} {...card} onClose={bridge.closeHotspot} />;
  }

  if (menu === "resources") {
    return (
      <ResourcesPanel
        groups={bridge.groups}
        label={site.ui.panels.hotspotsFlapLabel}
        onHotspot={bridge.goToHotspot}
        onClose={() => setMenu(null)}
      />
    );
  }

  if (menu === "map" && bridge.map) {
    return <MapPanel map={bridge.map} onClose={() => setMenu(null)} />;
  }

  if (barHidden) return null;

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
      onMap={bridge.map ? () => setMenu("map") : null}
      onInstructions={() => setMenu("instructions")}
      onHide={() => {
        setMenu(null);
        setBarHidden(true);
      }}
    />
  );
}
