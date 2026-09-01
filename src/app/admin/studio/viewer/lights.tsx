"use client";

/**
 * The studio's lighting rig, read straight off the draft.
 *
 * This is the same set of lights `terminal/scene/environment/scene-lights.tsx`
 * builds, reduced to what the AUTHOR needs to judge: ambient, sky fill, the
 * HDRI, and one shadow-casting sun. What is deliberately NOT reproduced is that
 * component's merge stack (defaults → venue → sky palette → mode override →
 * debug pin) — in the studio there is only one layer, the draft, because the
 * studio IS the thing that writes it. A knob here moves exactly the JSON key
 * with its name, and nothing downstream can quietly win over it.
 *
 * `sky.lights` is the one exception, and it is honoured because the runtime
 * honours it: those intensities are merged OVER `lights` at render time, so a
 * studio that ignored them would show a scene the terminal never draws.
 */

import { useEffect, useMemo, useRef } from "react";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { useDraftStore } from "../draft-store";
import { boundsCentre, boundsSpan, useViewerStore } from "../viewer-store";

export function StudioLights() {
  const lights = useDraftStore((s) => s.draft.lights);
  const sky = useDraftStore((s) => s.draft.sky);
  const shadows = useDraftStore((s) => s.draft.world.shadows);
  const envFile = useDraftStore((s) => s.draft.assets.envFile);
  const bounds = useViewerStore((s) => s.bounds);

  const sunRef = useRef<THREE.DirectionalLight>(null);

  // `sky.lights` overrides `lights` field by field at runtime — see the
  // `_note` on the sky block. Applied here so the two panels cannot disagree
  // about what is actually lighting the scene.
  const merged = useMemo(
    () => ({ ...lights, ...(sky?.lights ?? {}) }) as typeof lights & { envRotation?: number },
    [lights, sky?.lights],
  );

  const centre = useMemo(() => boundsCentre(bounds), [bounds]);
  const span = boundsSpan(bounds);

  /**
   * Seat the sun and fit its shadow frustum to the model.
   *
   * `lights.sunDirection` is a DIRECTION, not a position — the runtime
   * normalises it and pushes the light out along it far enough to clear the
   * model. Reproduced here because a shadow frustum sized for a 2 km terminal
   * and one sized for a 10 m room are nothing alike, and a studio that showed
   * un-fitted shadows would have the author dialling `shadowBias` against an
   * artefact the terminal does not have.
   */
  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    const dir = new THREE.Vector3(...merged.sunDirection).normalize();
    const distance = span * 1.5;
    sun.position.copy(centre).addScaledVector(dir, distance);
    sun.target.position.copy(centre);
    sun.target.updateMatrixWorld();

    const extent = (merged.shadowFollowExtent ?? span * 0.55) || span * 0.55;
    const cam = sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 0.5;
    cam.far = distance * 2.5;
    cam.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }, [merged.sunDirection, merged.shadowFollowExtent, centre, span]);

  return (
    <>
      <ambientLight intensity={merged.ambientIntensity} color={merged.ambientColor} />
      {!!merged.hemiIntensity && (
        <hemisphereLight
          intensity={merged.hemiIntensity}
          color={merged.hemiSkyColor ?? "#ffffff"}
          groundColor={merged.hemiGroundColor ?? "#ffffff"}
        />
      )}
      <directionalLight
        ref={sunRef}
        intensity={merged.sunIntensity}
        color={merged.sunColor}
        castShadow={shadows}
        shadow-mapSize-width={merged.shadowMapSize}
        shadow-mapSize-height={merged.shadowMapSize}
        shadow-radius={merged.shadowRadius}
        shadow-bias={merged.shadowBias}
        shadow-normalBias={merged.shadowNormalBias}
      />
      {/* `files` is the same HDRI path the terminal loads. A missing file
          throws inside Suspense, so the caller mounts this under a boundary. */}
      <Environment
        files={envFile}
        environmentIntensity={merged.envIntensity}
        environmentRotation={[0, ((merged.envRotation ?? 0) * Math.PI) / 180, 0]}
      />
    </>
  );
}
