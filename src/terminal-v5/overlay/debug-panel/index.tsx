"use client";

import dynamic from "next/dynamic";
import { useLightsStore } from "@/shared/stores/lights-store";
import { useDebugStore } from "../../stores/debug-store";

const Leva = dynamic(() => import("leva").then((m) => m.Leva), { ssr: false });
const DebugControls = dynamic(() => import("./controls"), { ssr: false });
const DebugCameraControls = dynamic(() => import("./camera-controls"), { ssr: false });

export function DebugPanel() {
  const resolved = useLightsStore((s) => s.resolved);
  const collapsed = useDebugStore((s) => s.panelCollapsed);
  const setCollapsed = useDebugStore((s) => s.setPanelCollapsed);

  return (
    <>
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
