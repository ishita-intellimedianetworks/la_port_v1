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
 * It runs the `v3` model: `config/sites/v3.json` — its own document, its own
 * cameras, its own bake. Nothing it holds is read by `/` or `/v2`.
 */

import "./styles.css";
import CanvasWithWrapper from "@/shared/canvas/canvas-with-wrapper";
import { getSite, type SiteId } from "@/config";
import { SiteProvider } from "@/config/context";
import { SITE_NODE_ID } from "@/shared/scene-data/adapter";
import TerminalProvider from "./provider";
import { initStores } from "./stores/init-stores";
import SceneGraph from "./scene-graph";
import Overlays from "./overlays";

interface TerminalExperienceProps {
  /** The engine's node id. Optional — one site projects to one node. */
  nodeId?: string;
  onReady?: () => void;
  /** WHICH MODEL to run — the site file read and the bake streamed. `v3` is
   *  this route's own document; the prop exists so the tree cannot silently
   *  read someone else's. */
  site?: SiteId;
}

export default function TerminalExperienceV3({
  nodeId = SITE_NODE_ID,
  onReady,
  site = "v3",
}: TerminalExperienceProps) {
  // Before anything below renders: the stores that seed from the site file get
  // THIS model's numbers. See `initStores`.
  initStores(getSite(site));
  return (
    <SiteProvider id={site}>
    <TerminalProvider nodeId={nodeId} onReady={onReady} dollhouseFirstVisit>
      <main className="absolute h-full w-full overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <CanvasWithWrapper>
            <SceneGraph />
          </CanvasWithWrapper>
        </div>
        <Overlays />
      </main>
    </TerminalProvider>
    </SiteProvider>
  );
}

export { default as TerminalProvider } from "./provider";
export { default as SceneGraph } from "./scene-graph";
export { default as Overlays } from "./overlays";
