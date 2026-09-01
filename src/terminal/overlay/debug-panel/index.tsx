"use client";

/**
 * DebugPanel - the `?debug=true` lighting panel. One panel for the whole look:
 * time of day, where the sun is, the HDRI, every light value, shadows and the
 * grade, plus a JSON export. It replaces the separate sky and grade widgets,
 * which is the difference that matters: you cannot judge sun intensity without
 * the exposure in front of you, and two panels meant two readouts to transcribe
 * at the end of a session, one of them stale.
 *
 * This file is only the MOUNTING. The controls are in `./controls`, and they
 * are held back until `lights-store.resolved` exists - Leva evaluates a control
 * schema once, so seeding it before the first frame would open every slider on
 * a default rather than on what is actually being rendered.
 *
 * Leva is loaded with `ssr: false`. It reaches for `window` while building its
 * store, and there is nothing to gain from server-rendering a debug panel.
 */

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
