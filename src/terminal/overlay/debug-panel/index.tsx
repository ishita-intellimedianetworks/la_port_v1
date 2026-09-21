"use client";

import dynamic from "next/dynamic";
import { useLightsStore } from "@/shared/stores/lights-store";

const Leva = dynamic(() => import("leva").then((m) => m.Leva), { ssr: false });
const DebugControls = dynamic(() => import("./controls"), { ssr: false });

export function DebugPanel() {
  // What SceneLights actually rendered, every layer resolved. Null for the
  // first frame or two, while the model's bounds land.
  const resolved = useLightsStore((s) => s.resolved);

  return (
    <>
      {/* Pushed clear of PerfMeter, which holds the same corner. Draggable by
          its title bar if it ever lands over something worth seeing. */}
      <Leva titleBar={{ title: "lighting", position: { x: 0, y: 92 } }} />
      {resolved && <DebugControls seed={resolved} />}
    </>
  );
}

export default DebugPanel;
