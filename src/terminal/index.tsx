"use client";

/**
 * TerminalExperience — the Everport digital twin, rendered at /.
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
  /**
   * WHICH BAKE to stream — the only thing that differs between `/` and `/v2`.
   *
   * `v1` is `site.json > stream`, frozen at the behaviour this route had before
   * the streaming work: the object-chunked v5-obj set, the transmission pass
   * unconditional, no progressive textures, a fixed pixel ratio. `v2` is
   * `streamV2` merged over it — the instanced, animated-water bake plus the lag
   * work. Everything else (cameras, hotspots, map, layouts) is the same zone
   * and the same data, which is what makes the two comparable.
   *
   * Defaults to `v1` so a caller that says nothing gets the known-good route.
   */
  streamVariant?: StreamVariantId;
}

export default function TerminalExperience({
  siteId = defaultSiteId,
  onReady,
  streamVariant = "v1",
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
