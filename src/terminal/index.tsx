"use client";

/**
 * TerminalExperience — the Everport digital twin, rendered at /.
 *
 * Three layers, one provider:
 *   provider.tsx    owns the phase machine, the load gates and the shared state
 *   scene-graph.tsx everything inside the WebGL canvas
 *   overlays.tsx    everything on top of it
 *
 * WHICH MODEL it runs comes in as `site`, and that one id decides everything:
 * the document read (`config/sites/<id>.json`), the bake streamed, the stores'
 * seeds. `/` mounts it as v1 and `/v2` as v2 — two complete configs, one
 * component tree.
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
  /**
   * WHICH MODEL to run: the site file read AND the bake streamed, which are one
   * choice.
   *
   * `v1` is `config/sites/v1.json`, frozen at the behaviour this route had
   * before the streaming work: the object-chunked v5-obj set, the transmission
   * pass unconditional, no progressive textures, a fixed pixel ratio. `v2` is
   * `config/sites/v2.json` — the instanced, animated-water bake plus the lag
   * work, in a document of its own. The two files still describe the same zone,
   * which is what makes the routes comparable; they just cannot edit each other
   * any more.
   *
   * Defaults to `v1` so a caller that says nothing gets the known-good route.
   */
  site?: SiteId;
}

export default function TerminalExperience({
  nodeId = SITE_NODE_ID,
  onReady,
  site = "v1",
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
