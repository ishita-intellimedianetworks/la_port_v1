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

/**
 * Frames per second the render loop is allowed to run at.
 *
 * THE SCENE IS FILL- AND DRAW-BOUND, NOT FRAME-BOUND. The resident set is 345
 * chunks over 1,903 material splits, so every rendered frame is ~1,900 draw
 * calls whether or not anything moved — and with R3F's default loop that ran as
 * fast as the panel allowed, forever, including while the player stood still.
 * On a phone that is a sustained thermal load with nothing to show for it: this
 * is click-to-walk, so the camera is stationary most of the time, and the frames
 * in between are redraws of an identical image.
 *
 * Halving the rate halves GPU and CPU work outright, which is a far larger and
 * far cheaper win than anything `AdaptiveQuality` can do — and one it cannot
 * reach on its own, because it only reacts above 50 ms/frame. A handset holding
 * a comfortable 45 fps never trips it and simply runs hot.
 *
 * 60 on a desktop caps 120/144 Hz panels, which were spending three to five
 * thousand draw calls a second on refreshes nobody asked for.
 */
const FPS_CAP = 60;
const FPS_CAP_LOW_POWER = 30;

/**
 * Rate-limits the render loop. Mounted inside the Canvas because it needs the
 * R3F store; renders nothing.
 *
 * Works with `frameloop="demand"`, where R3F draws only when something calls
 * `invalidate()`. The rAF below still fires at panel rate — it costs a timestamp
 * comparison — but it only invalidates on the interval, so the RENDER rate is
 * what is capped, not the callback rate. Anything else in the app that calls
 * `invalidate()` (drei controls, a transition) still gets its frame immediately,
 * so this is a ceiling rather than a fixed cadence.
 *
 * Deliberately NOT `useFrame`: that runs inside the loop being limited, so it
 * could only ever observe frames, not schedule them.
 */
const FrameLimiter: FunctionComponent<{ fps: number }> = ({ fps }) => {
  // Read through the store rather than subscribing — `invalidate` is stable for
  // the life of the canvas and the same reasoning as GradeExposure applies.
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
            // Grades the 3D image only: the glass UI and drei's Html portals
            // are siblings of this element, so they stay untinted.
            filter,
          }}
          gl={{
            // MSAA off on constrained devices: a multisampled attachment is
            // ~4× the framebuffer (~29 MB on a landscape phone at DPR 1.5) that
            // `residentBytes()` cannot see, and the aliasing it hides is barely
            // visible at that size. Context-creation flag — fixed for the life
            // of the canvas, so it uses the same `isLowPower()` as shadows/dpr.
            antialias: !lowPower,
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: THREE.NeutralToneMapping
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
                  `Streaming GPU budget cut to ${Math.round(scale * 100)}% for this session — ` +
                  "which only bites in STREAMED mode: updateResident() returns before every " +
                  "budget check, so under residency this call is advisory and the ceiling has " +
                  "to be held by freeCpuArrays and the resident tier instead. A residency " +
                  "session that has freed its CPU arrays cannot repopulate its buffers either, " +
                  "so recovery there means reloading the page, not restoring in place.",
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
