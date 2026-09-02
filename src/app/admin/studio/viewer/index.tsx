"use client";

/**
 * The studio viewport — one Canvas, mounted once at the shell and shared by
 * every step.
 *
 * MOUNTED ONCE IS THE WHOLE POINT. Stepping from Cameras to Lighting must not
 * re-download a 40 MB GLB, re-compile its shaders, or throw away the vantage
 * the author had carefully lined up. So the steps are panels beside a
 * persistent canvas rather than pages that own one, and everything they need to
 * say to it goes through `viewer-store`.
 *
 * What it renders is the draft, not the config: FOV, grade, lights, markers and
 * the model path are all read from `useDraftStore`, so a slider moves the
 * picture rather than a number that will move the picture after a save and a
 * reload. That is the difference between this and dialling `site.json` by hand.
 */

import { Suspense, useEffect } from "react";
import { Canvas, useStore } from "@react-three/fiber";
import * as THREE from "three";
import { filterCss } from "@/shared/stores/grade-store";
import { useDraftStore } from "../draft-store";
import { boundsSpan, useViewerStore } from "../viewer-store";
import { StudioControls } from "./controls";
import { StudioLights } from "./lights";
import { StudioMarkers } from "./markers";
import { StudioModel } from "./model";

/** `world.fov` and `world.grade.exposure`, applied to the live renderer.
 *  Renders nothing — it exists to reach the two objects only R3F holds. */
function LiveRenderSettings() {
  // The camera and the renderer are read out of the R3F store INSIDE each
  // effect rather than subscribed to with `useThree(s => s.camera)`. That is
  // the idiom `canvas-with-wrapper` already uses for exactly this, and the
  // lint rule that rejects the alternative is right about both halves of why:
  // writing to a value a hook just returned is the mutation React cannot see,
  // and depending on the object's identity would re-run these on churn that
  // has nothing to do with the number being applied. What IS subscribed to is
  // the one value that should re-run them.
  const store = useStore();
  const fov = useDraftStore((s) => s.draft.world.fov);
  const exposure = useDraftStore((s) => s.draft.world.grade?.exposure ?? 1);

  useEffect(() => {
    const { camera, invalidate } = store.getState();
    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera || perspective.fov === fov) return;
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
    invalidate();
  }, [store, fov]);

  useEffect(() => {
    // The FREE half of the grade: a uniform inside the tone-mapping step
    // three.js already runs, acting while the full dynamic range is still in
    // hand. See `world.grade` in the schema for why this and the CSS filter
    // below are deliberately two different mechanisms.
    const { gl, invalidate } = store.getState();
    gl.toneMappingExposure = exposure;
    invalidate();
  }, [store, exposure]);

  return null;
}

/** A ground grid at the model's scale, for judging heights against something.
 *  Off by default — on a 2 km terminal it is mostly noise. */
function StudioGrid() {
  const bounds = useViewerStore((s) => s.bounds);
  const show = useViewerStore((s) => s.showGrid);
  if (!show) return null;
  const span = boundsSpan(bounds);
  const y = bounds ? bounds.min[1] : 0;
  return (
    <gridHelper
      args={[span * 1.5, 30, "#334155", "#1e293b"]}
      position={[0, y, 0]}
      // The grid is a reference surface, not something to select or place on.
      raycast={() => null}
    />
  );
}

export function StudioViewer() {
  const grade = useDraftStore((s) => s.draft.world.grade);
  const error = useViewerStore((s) => s.modelError);

  // The LDR half of the grade, on the canvas element exactly as the terminal
  // applies it — so what the author judges here is the composited image the
  // visitor sees, not the raw render.
  const filter = filterCss({
    brightness: grade?.brightness ?? 0,
    contrast: grade?.contrast ?? 0,
    saturation: grade?.saturation ?? 0,
  });

  return (
    <div className="relative h-full w-full bg-[#05070c]">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ fov: 35, near: 0.1, far: 20000, position: [0, 50, 120] }}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.NeutralToneMapping,
        }}
        style={{ height: "100%", width: "100%", filter }}
      >
        <color attach="background" args={["#05070c"]} />
        <LiveRenderSettings />
        {/* The HDRI and the GLB both suspend. Markers and controls sit OUTSIDE
            the boundary so the gizmos stay live while a model is loading —
            otherwise switching models blanks the whole scene graph. */}
        <Suspense fallback={null}>
          <StudioLights />
          <StudioModel />
        </Suspense>
        <StudioGrid />
        <StudioMarkers />
        <StudioControls />
      </Canvas>

      {/* No "nothing loaded" state here: the shell does not mount this until a
          model exists, so the only empty canvas is one that failed to load —
          which says so below. */}
      {error && (
        <div className="absolute inset-x-4 bottom-4 rounded-lg border border-[#ef4444]/50 bg-[#ef4444]/15 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

export default StudioViewer;
