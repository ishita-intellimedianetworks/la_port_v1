"use client";

import dynamic from "next/dynamic";
import { useLightsStore } from "@/shared/stores/lights-store";
import { useDebugStore } from "../../stores/debug-store";

const Leva = dynamic(() => import("leva").then((m) => m.Leva), { ssr: false });
const DebugControls = dynamic(() => import("./controls"), { ssr: false });
const DebugCameraControls = dynamic(() => import("./camera-controls"), { ssr: false });

export function DebugPanel() {
  // What SceneLights actually rendered, every layer resolved. Null for the
  // first frame or two, while the model's bounds land.
  const resolved = useLightsStore((s) => s.resolved);
  // Collapse is CONTROLLED, so the "edit camera" button on an open resource can
  // pop the panel open from the other side of the overlay tree.
  const collapsed = useDebugStore((s) => s.panelCollapsed);
  const setCollapsed = useDebugStore((s) => s.setPanelCollapsed);

  return (
    <>
      {/* Pushed clear of PerfMeter, which holds the same corner. Draggable by
          its title bar if it ever lands over something worth seeing. */}
      <Leva
        titleBar={{ title: "debug", position: { x: 0, y: 92 } }}
        collapsed={{ collapsed, onChange: setCollapsed }}
      />
      {resolved && <DebugControls seed={resolved} />}
      <DebugCameraControls />
    </>
  );
}

export default DebugPanel;
