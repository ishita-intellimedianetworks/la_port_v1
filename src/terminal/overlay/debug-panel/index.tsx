"use client";

import dynamic from "next/dynamic";
import { useLightsStore } from "@/shared/stores/lights-store";

const Leva = dynamic(() => import("leva").then((m) => m.Leva), { ssr: false });
const DebugControls = dynamic(() => import("./controls"), { ssr: false });

export function DebugPanel() {
  const resolved = useLightsStore((s) => s.resolved);

  return (
    <>
      <Leva titleBar={{ title: "lighting", position: { x: 0, y: 92 } }} />
      {resolved && <DebugControls seed={resolved} />}
    </>
  );
}

export default DebugPanel;
