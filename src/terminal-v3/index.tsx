"use client";

/**
 * TerminalExperienceV3 — the Everport digital twin, rendered at /v3.
 *
 * A full fork of `src/terminal`, byte-identical when it was made. Edits here
 * cannot reach `/` or `/v2`. Do not re-export one tree from the other — that
 * restores the coupling this fork exists to remove.
 *
 * Three layers, one provider:
 *   provider.tsx    owns the phase machine, the load gates and the shared state
 *   scene-graph.tsx everything inside the WebGL canvas
 *   overlays.tsx    everything on top of it
 *
 * The site is resolved from config, so there is no id to pass in.
 */

import "./styles.css";
import CanvasWithWrapper from "@/shared/canvas/canvas-with-wrapper";
import { defaultSiteId } from "@/shared/scene-data/adapter";
import TerminalProvider from "./provider";
import { StreamVariantProvider } from "@/streaming/variant";
import type { StreamVariantId } from "@/streaming/config";
import SceneGraph from "./scene-graph";
import Overlays from "./overlays";

/**
 * V3's OWN SPAWN — where first person begins and where Home returns to, for
 * this route only.
 *
 * `cameras.spawn` in site.json is shared with `/` and `/v2`, so editing it
 * there would move all three. This patches the single floor ("terminal")
 * instead: every reader of the start pose — Home, the dollhouse fly-in, the
 * first-person entry — prefers the active floor's over the site node's.
 *
 * TAKEN FROM cp_012 in la-port-zone-c5-cp-v4.glb via /extract-pos. That tool
 * prints an XYZ euler, [3.0914, 0.2333, -3.13]; the rotation below is the YXZ
 * reorder the camera is actually set with, so re-derive it rather than pasting
 * the printed triple. Roll comes out at 0, i.e. the authored camera is level.
 */
const V3_SPAWN = {
  startPosition: [-1326.861, 27.735, -224.4829] as [number, number, number],
  startRotation: [0.0489, 2.9081, 0] as [number, number, number],
};

interface TerminalExperienceProps {
  /** Optional — defaults to the single configured site. */
  siteId?: string;
  onReady?: () => void;
  /** WHICH BAKE to stream. `v3` resolves to `site.json > streamV3` if that
   *  block is authored, and to whatever `/v2` resolved to if it is not. */
  streamVariant?: StreamVariantId;
}

export default function TerminalExperienceV3({
  siteId = defaultSiteId,
  onReady,
  streamVariant = "v3",
}: TerminalExperienceProps) {
  return (
    <StreamVariantProvider id={streamVariant}>
    <TerminalProvider
      nodeId={siteId}
      onReady={onReady}
      dollhouseFirstVisit
      floorPatches={{ terminal: V3_SPAWN }}
    >
      <main className="absolute h-full w-full overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <CanvasWithWrapper>
            <SceneGraph />
          </CanvasWithWrapper>
        </div>
        <Overlays />
      </main>
    </TerminalProvider>
    </StreamVariantProvider>
  );
}

export { default as TerminalProvider } from "./provider";
export { default as SceneGraph } from "./scene-graph";
export { default as Overlays } from "./overlays";
