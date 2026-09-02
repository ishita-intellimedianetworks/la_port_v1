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
    <TerminalProvider nodeId={siteId} onReady={onReady} dollhouseFirstVisit>
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
