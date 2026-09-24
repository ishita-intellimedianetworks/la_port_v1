"use client";

import "../styles.css";
import CanvasWithWrapper from "@/shared/canvas/canvas-with-wrapper";
import { getSite, type SiteId } from "@/config";
import { SiteProvider } from "@/config/context";
import { SITE_NODE_ID } from "@/shared/scene-data/adapter";
import { EnterVrPrompt } from "@/vr/enter-vr-prompt";
import { VrLoader } from "@/vr/vr-loader";
import { VrSession } from "@/vr/session";
import TerminalProvider from "../provider";
import { initStores } from "../stores/init-stores";
import SceneGraph from "../scene-graph";
import { V4VrBridge } from "./bridge";

export default function TerminalExperienceV4Vr({ site = "v4" }: { site?: SiteId }) {
  initStores(getSite(site));
  return (
    <SiteProvider id={site}>
      <TerminalProvider nodeId={SITE_NODE_ID} dollhouseFirstVisit>
        <V4VrBridge>
          <main className="absolute h-full w-full overflow-hidden">
            <div className="absolute inset-0 overflow-hidden">
              <CanvasWithWrapper>
                <VrSession>
                  <SceneGraph />
                </VrSession>
              </CanvasWithWrapper>
            </div>
            <VrLoader />
            <EnterVrPrompt />
          </main>
        </V4VrBridge>
      </TerminalProvider>
    </SiteProvider>
  );
}
