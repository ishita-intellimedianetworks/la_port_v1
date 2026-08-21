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
import SceneGraph from "./scene-graph";
import Overlays from "./overlays";

interface TerminalExperienceProps {
  /** Optional — defaults to the single configured site. */
  siteId?: string;
  onReady?: () => void;
}

export default function TerminalExperience({
  siteId = defaultSiteId,
  onReady,
}: TerminalExperienceProps) {
  return (
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
  );
}

export { default as TerminalProvider } from "./provider";
export { default as SceneGraph } from "./scene-graph";
export { default as Overlays } from "./overlays";
