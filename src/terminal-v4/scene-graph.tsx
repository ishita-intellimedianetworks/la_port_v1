"use client";

/**
 * SceneGraph — R3F children for the interior phase.
 */

import { SceneContent } from "./scene";
import { useTerminalUi } from "./context/ui-context";

export default function SceneGraph() {
  const { sceneContent: d } = useTerminalUi();

  return (
    <>
    <SceneContent
      floors={d.floors}
      furniture={d.furniture}
      speed={d.speed}
      cameraHeight={d.cameraHeight}
      startPosition={d.startPosition}
      startRotation={d.startRotation}
      dollHouseCamera={d.dollHouseCamera}
      dollHouseModelUrl={d.dollHouseModelUrl}
      dollHousePreviewUrl={d.dollHousePreviewUrl}
      firstPersonStart={d.firstPersonStart}
      onEnterFirstPerson={d.handleEnterFirstPerson}
      onTransitionCue={d.handleTransitionCue}
      cinematicActive={d.cinematicActive}
      setCinematicActive={d.setCinematicActive}
      onLoaded={() => d.setIsModelLoaded(true)}
      onModelLoaded={d.handleModelLoaded}
      onRevealStart={d.handleRevealStart}
      onRevealDone={d.handleRevealDone}
      // Shared uGlobalAlpha for the point-cloud → dither reveal (village has a
      // baked .preview.bin). Inline/orchestrated mode skips the effect.
      sharedUniforms={d.inlineMode ? undefined : d.sharedUniforms}
      debug={d.debug}
      skipEffects={d.inlineMode}
    />
    </>
  );
}
