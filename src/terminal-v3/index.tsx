"use client";

/**
 * TerminalExperienceV3 — the Everport digital twin, rendered at /v3.
 *
 * A FULL FORK of `src/terminal`, not a wrapper around it. The two trees were
 * byte-identical at the commit that created this one and share nothing above
 * `@/shared`, `@/streaming` and `@/config`, which is the entire point: /v3 is
 * where this scene gets taken apart, and an edit here must not be able to reach
 * `/` or `/v2`. Do not "de-duplicate" the two by re-exporting one from the
 * other — that would quietly restore the coupling this fork exists to remove.
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
   * WHICH BAKE to stream.
   *
   * Defaults to `v3` here — this tree belongs to that route, so the default is
   * the honest one, unlike the shared tree where `v1` is the safe fallback. `v3`
   * resolves to `streamV3` when site.json authors one and to whatever `/v2`
   * resolved to when it does not, so this route streams the v2 bake until
   * somebody deliberately points it somewhere else.
   */
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
