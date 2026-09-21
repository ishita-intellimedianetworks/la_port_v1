"use client";

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
