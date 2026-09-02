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

/**
 * Covers the canvas until there is something on it.
 *
 * The canvas is mounted the instant a file is chosen and stays black through
 * the download AND the decode — Draco and KTX2 unpacking is the long half on a
 * big bake, and it happens after the last byte lands. Without this the studio
 * looks broken for those seconds, in exactly the way that makes someone pick
 * the file a second time.
 *
 * Determinate while the transfer reports a length, indeterminate when it does
 * not, and "Decoding" once the bytes are in — three states because they fail
 * differently, and a bar parked at 100% would be describing the wrong one.
 */
function LoadingOverlay() {
  const progress = useViewerStore((s) => s.modelProgress);
  const label = useViewerStore((s) => (s.model.kind === "none" ? "" : s.model.label));
  if (progress === null) return null;

  const percent = Math.round(progress * 100);
  const decoding = progress >= 1;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#05070c]">
      <span className="h-9 w-9 animate-spin rounded-full border-2 border-[#4b5563] border-t-[#22c55e]" />
      <div className="w-64 text-center">
        <p className="truncate font-mono text-[11px] text-slate-300">{label}</p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#374151]">
          <div
            className={`h-full rounded-full bg-[#22c55e] ${
              // No length to measure against: sweep instead of pretending to
              // know how far along it is.
              progress > 0 ? "transition-[width] duration-200" : "w-1/3 animate-pulse"
            }`}
            style={progress > 0 ? { width: `${percent}%` } : undefined}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-300">
          {decoding ? "Decoding geometry and textures…" : progress > 0 ? `${percent}%` : "Loading…"}
        </p>
      </div>
    </div>
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

      <LoadingOverlay />

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
