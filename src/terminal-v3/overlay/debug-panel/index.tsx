"use client";

/**
 * DebugPanel - the `?debug=true` panel. One panel for the whole look and the
 * whole framing: time of day, where the sun is, the HDRI, every light value,
 * shadows, the grade, the field of view, the navmesh overlay, and a live
 * two-way binding to the camera on screen — plus the JSON to paste back.
 *
 * It replaces the separate sky and grade widgets, which is the difference that
 * matters: you cannot judge sun intensity without the exposure in front of you,
 * and two panels meant two readouts to transcribe at the end of a session, one
 * of them stale. The camera folder is here for the same reason — a framing is
 * judged under a light, so the two belong on one surface.
 *
 * This file is only the MOUNTING. The controls are in `./controls` (lighting)
 * and `./camera-controls` (view + camera).
 *
 * The two are held back differently on purpose. Lighting waits for
 * `lights-store.resolved` — Leva evaluates a control schema once, so seeding it
 * before the first frame would open every slider on a default rather than on
 * what is actually being rendered. The camera folder has nothing to wait for:
 * it polls, and an unresolved camera simply shows nothing yet.
 *
 * Leva is loaded with `ssr: false`. It reaches for `window` while building its
 * store, and there is nothing to gain from server-rendering a debug panel.
 */

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
