"use client";

import { HoloTwinHud } from "@/shared/ui/screens/loading-screen";
import { useProgressStore } from "@/shared/stores/progress-store";
import { useVrBridge } from "./bridge";

export function VrLoader() {
  const { loader } = useVrBridge();
  const revealProgress = useProgressStore((s) => s.revealProgress);
  if (!loader.show) return null;
  return (
    <HoloTwinHud
      progress={0}
      visible={!(revealProgress >= 0.999 && loader.othersCached)}
      onFadeComplete={loader.hide}
      unitName={loader.unitName}
      revealVeil={loader.revealVeil}
    />
  );
}
