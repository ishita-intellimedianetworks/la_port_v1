"use client";

import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AERIAL_SWITCH, type StreamingConfig } from "@/streaming/config";

/**
 * Which streaming strategy the CAMERA needs — the ground bands or the aerial
 * ones — re-decided from its height every frame.
 *
 * WHY A SWAP EXISTS AT ALL. The ground bands assume the camera is standing in
 * the terminal, so they reach a few hundred metres. Every `layouts[]` camera is
 * a framing shot authored 54-412 m up and as much as 2.8 km out, and from four
 * of the ten the ground bands resolved 2 chunks of 831 — the water plane and
 * the terrain plane, the only two whose boxes contain the camera. Everything
 * built sat outside the unload radius, so those shots framed empty sky. See the
 * `aerial` block in `site.json > stream` for the per-layout measurements and
 * for why spanning the whole district costs only ~22 MB.
 *
 * WHY HEIGHT, and not "is a layout selected". Height is the property that
 * actually causes the problem: the higher the camera, the more world is in
 * frame and the further the bands have to reach. Reading it from the camera
 * covers the cases a destination flag would miss — mid-teleport, a camera the
 * player has walked away from, and any framing camera added later, which then
 * needs no wiring of its own. The two thresholds are authored, not guessed.
 *
 * The returned object is referentially stable while the strategy does not
 * change, so `StreamedModel` and `StreamFog` see a new config ONLY on a flip —
 * which is what makes `ChunkManager.setConfig()` the right receiver: it
 * re-decides every chunk against the new numbers on the next tick and keeps the
 * decoded-chunk cache, so coming back down re-mounts from memory rather than
 * re-downloading the walk-around set.
 */
export function useStreamConfigForCamera(
  ground: StreamingConfig,
  aerial: StreamingConfig | null,
): StreamingConfig {
  const aloft = useCameraAloft();
  return aloft && aerial ? aerial : ground;
}

/**
 * Is the camera up at framing height? The `stream.aerial` thresholds, read off
 * the camera every frame with hysteresis — enter high, leave low, so a camera
 * resting on the line cannot flip every frame.
 *
 * Split out because streaming is not the only thing that has to know. The SUN
 * has the same problem for the same reason: its shadow square is sized and
 * centred for someone standing in the terminal, and from a framing camera that
 * square sits under the camera instead of over the shot. Both answers are "how
 * high is the camera", so both read it from one place. See SceneEnvironment.
 */
export function useCameraAloft(): boolean {
  const camera = useThree((s) => s.camera);
  const [aloft, setAloft] = useState(false);
  const world = useRef(new THREE.Vector3());

  useFrame(() => {
    const at = AERIAL_SWITCH;
    if (!at) return;
    const y = camera.getWorldPosition(world.current).y;
    // setState with an unchanged value is a no-op in React, so this costs
    // nothing on the frames — nearly all of them — where the answer is stable.
    setAloft((was) => (was ? y >= at.exitBelow : y >= at.enterAbove));
  });

  return aloft;
}
