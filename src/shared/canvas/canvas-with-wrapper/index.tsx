import { FunctionComponent, PropsWithChildren, Suspense, useEffect } from "react";
import { Canvas, useStore } from "@react-three/fiber";
import * as THREE from "three";

import { useSite } from "@/config/context";
import { sceneDataFor } from "@/shared/scene-data/adapter";
import isLowPower from "@/shared/runtime";
import { degradeGpuBudget } from "@/streaming/memory";
import { filterCss, useGradeStore } from "@/shared/stores/grade-store";

// three r183 deprecated THREE.Clock, but @react-three/fiber (≤ 9.x) still
// constructs one internally — nothing to act on until R3F v10. Drop that one
// notice; every other three log passes through.
THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (type === "warn" && typeof message === "string" && message.startsWith("THREE.Clock: This module has been deprecated")) return;
  const fn = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  fn(message, ...params);
});


/**
 * Exposure — the HDR half of the grade. Mounted inside the Canvas because it
 * needs the renderer; it renders nothing. `toneMappingExposure` is a uniform in
 * a pass three.js already runs, so it is free and acts before the range is
 * clipped, letting highlights roll off rather than clamp.
 */
const GradeExposure: FunctionComponent = () => {
  // Read the renderer out of the store inside the effect rather than
  // `useThree(s => s.gl)`: don't mutate a hook's return value, and don't re-run
  // on renderer churn unrelated to exposure.
  const store = useStore();
  const exposure = useGradeStore((s) => s.exposure);
  useEffect(() => {
    // The loop runs continuously here, so the next frame picks this up.
    store.getState().gl.toneMappingExposure = exposure;
  }, [store, exposure]);
  return null;
};

/** Render-rate ceiling. Every frame is ~1,900 draw calls whether or not
 *  anything moved, and the loop ran flat out even while standing still. */
const FPS_CAP = 60;
const FPS_CAP_LOW_POWER = 30;

/** Rate-limits the render loop. Pairs with `frameloop="demand"`: rAF still ticks
 *  at panel rate but only invalidates on the interval, so the RENDER rate is
 *  capped. Other callers of `invalidate()` still get their frame at once. */
const FrameLimiter: FunctionComponent<{ fps: number }> = ({ fps }) => {
  const store = useStore();
  useEffect(() => {
    const step = 1000 / fps;
    let raf = 0;
    let last = -Infinity;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < step) return;
      last = t;
      store.getState().invalidate();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, fps]);
  return null;
};

type Props = PropsWithChildren<{
  initialPosition?: [number, number, number];
  initialRotation?: [number, number, number];
}>;

const CanvasWithWrapper: FunctionComponent<Props> = ({
  children,
  initialPosition,
  initialRotation,
}) => {
  // Opening pose and FOV come from the active site — every route mounts this
  // same Canvas.
  const site = useSite();
  const { entry } = sceneDataFor(site);
  const [px, py, pz] = initialPosition ?? entry.position;
  const [rx, ry, rz] = initialRotation ?? entry.rotation;
  // One sun, shadow map frozen after a single render (see SceneLights). Off on
  // low-power devices.
  const lowPower = isLowPower();
  // The LDR half of the grade, as a CSS filter on the canvas element — no
  // post-processing pass needed. `undefined` while neutral, which keeps the
  // canvas off its own composited layer.
  const brightness = useGradeStore((s) => s.brightness);
  const contrast = useGradeStore((s) => s.contrast);
  const saturation = useGradeStore((s) => s.saturation);
  const filter = filterCss({ brightness, contrast, saturation });

  return (
    <>
      <div className="w-full h-full">
        <Canvas
          // Explicit PCFShadowMap — the boolean form picks the deprecated
          // PCFSoftShadowMap, which warns every frame.
          shadows={lowPower ? false : { type: THREE.PCFShadowMap }}
          // Cap render resolution: the default is the full device pixel ratio,
          // up to 3× on phones, which with MSAA is ~4-9× the framebuffer.
          dpr={lowPower ? [1, 1.25] : [1, 1.5]}
          camera={{
            fov: site.scene.world.fov,
            near: 0.1,
            // Generous far plane — the models are large and the sky backdrop
            // must not clip.
            far: 10000,
            position: [px, py, pz],
            rotation: [rx, ry, rz],
          }}
          style={{
            height: "100%",
            width: "100%",
            position: "relative",
            touchAction: "none",
            // Grades the 3D image only — the glass UI and drei's Html portals
            // are siblings, so they stay untinted. Device-independent on
            // purpose: this is a DOM style, and branching it on isLowPower()
            // mismatches hydration (SSR has no window and answers false).
            filter,
          }}
          gl={{
            // Off on low power: a multisampled attachment is ~4x the
            // framebuffer and invisible to `residentBytes()`. Tried twice, the
            // phone lost its context both times. It only becomes affordable once
            // the resident set shrinks — see the resident radius.
            antialias: !lowPower,
            outputColorSpace: THREE.SRGBColorSpace,
            // Per-fragment, and a phone is fill-bound first. Off there:
            // highlights clip instead of rolling off, and `toneMappingExposure`
            // goes inert with it.
            toneMapping: lowPower ? THREE.NoToneMapping : THREE.NeutralToneMapping
          }}
          // Paired with FrameLimiter above: R3F draws only when invalidated, and
          // that component is what invalidates, on an interval. Without the
          // limiter this must go back to "always" or the scene freezes.
          frameloop="demand"
          id="canvas-wrapper"
          onCreated={({ gl }) => {
            // A lost context stops the render loop silently: the progress bar
            // is written from inside it, so the loading screen just freezes.
            // three says nothing on the way down, so say it here.
            const canvas = gl.domElement;
            const onLost = (e: Event) => {
              // Halve the streamer's GPU ceiling and keep it halved — a loss is
              // the only hard evidence about real VRAM this page ever gets.
              const scale = degradeGpuBudget();
              console.error(
                "[canvas] WebGL context LOST — the render loop has stopped. " +
                  "On a phone this is usually VRAM. " +
                  `Streaming GPU budget cut to ${Math.round(scale * 100)}%, which only ` +
                  "bites in streamed mode — residency holds its ceiling with freeCpuArrays " +
                  "and the resident tier, and cannot repopulate freed buffers, so recovery " +
                  "there is a page reload.",
                e,
              );
              // Without this the browser may decline to restore at all.
              e.preventDefault();
            };
            const onRestored = () => console.warn("[canvas] WebGL context restored");
            canvas.addEventListener("webglcontextlost", onLost);
            canvas.addEventListener("webglcontextrestored", onRestored);
          }}
        >
          <GradeExposure />
          <FrameLimiter fps={lowPower ? FPS_CAP_LOW_POWER : FPS_CAP} />
          <Suspense fallback={null}>
            <group name="dollhouse-model">{children}</group>
          </Suspense>
          <color attach="background" args={["#000"]} />
        </Canvas>
      </div>
    </>
  );
};

export default CanvasWithWrapper;
