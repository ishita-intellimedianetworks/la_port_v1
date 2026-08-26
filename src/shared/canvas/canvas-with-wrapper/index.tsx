import { FunctionComponent, PropsWithChildren, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { entry } from "@/shared/scene-data/adapter";
import { FOV_DEFAULT } from "@/shared/stores/camera-store";
import isLowPower from "@/shared/runtime";
import { degradeGpuBudget } from "@/streaming/memory";

const defaultPos = entry.position;
const defaultRot = entry.rotation;

// three r183 deprecated THREE.Clock, but @react-three/fiber (≤ 9.x) still
// constructs one inside its store — a warning the app can't act on until R3F
// v10 migrates to THREE.Timer. Drop that one known notice via three's official
// console hook; every other three log/warn/error passes through untouched.
THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (type === "warn" && typeof message === "string" && message.startsWith("THREE.Clock: This module has been deprecated")) return;
  const fn = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  fn(message, ...params);
});


type Props = PropsWithChildren<{
  initialPosition?: [number, number, number];
  initialRotation?: [number, number, number];
}>;

const CanvasWithWrapper: FunctionComponent<Props> = ({
  children,
  initialPosition,
  initialRotation,
}) => {
  const [px, py, pz] = initialPosition ?? defaultPos;
  const [rx, ry, rz] = initialRotation ?? defaultRot;
  // Shadows are from ONE sun, its shadow camera fitted to the model bounds and
  // the shadow map FROZEN after a single render (see SceneLights) — the scene is
  // static, so the map never re-renders and never shimmers while walking. Off on
  // low-power devices. Mirrors the reference exterior's shadow setup.
  const lowPower = isLowPower();

  return (
    <>
      <div className="w-full h-full">
        <Canvas
          // Explicit PCFShadowMap — the default boolean `shadows` picks the now-
          // deprecated PCFSoftShadowMap (warns every frame). Off on low-power.
          shadows={lowPower ? false : { type: THREE.PCFShadowMap }}
          // Cap the render resolution. R3F's default is the full device pixel
          // ratio — up to 3× on phones — which with MSAA multiplies framebuffer
          // memory ~4-9× over 1×. 1.5× is visually indistinguishable on these
          // venue scenes and is what the Smart-Loader demo ships with; phones
          // get 1.25× (they're also the memory-tightest devices).
          dpr={lowPower ? [1, 1.25] : [1, 1.5]}
          camera={{
            fov: FOV_DEFAULT,
            near: 0.1,
            // Large olympics models — keep the far plane generous so the model
            // and sky backdrop aren't clipped (matches the reference canvas).
            far: 10000,
            position: [px, py, pz],
            rotation: [rx, ry, rz],
          }}
          style={{
            height: "100%",
            width: "100%",
            position: "relative",
            touchAction: "none",
          }}
          gl={{
            antialias:  true,
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: THREE.NeutralToneMapping
          }}
          id="canvas-wrapper"
          onCreated={({ gl }) => {
            // A lost context is the one failure mode that looks like nothing at
            // all: the render loop simply stops, so the progress bar — which is
            // written from inside that loop — freezes wherever it was and the
            // loading screen never lifts. three re-creates the renderer state on
            // restore, but says nothing on the way down. Say it, so a phone that
            // runs out of VRAM reports that rather than just hanging.
            const canvas = gl.domElement;
            const onLost = (e: Event) => {
              // Halve the streamer's GPU ceiling and KEEP it halved. A loss is
              // the only hard evidence this page ever gets about the machine's
              // real video-memory limit — every other input (`deviceMemory`, the
              // renderer string) is a guess — so it is worth more than the
              // budget it overrides. The next streaming tick evicts against the
              // reduced figure; see streaming/memory.ts > degradeGpuBudget.
              const scale = degradeGpuBudget();
              console.error(
                "[canvas] WebGL context LOST — the render loop has stopped. " +
                  "On a phone this is usually VRAM: the model's textures did not fit. " +
                  `Streaming GPU budget cut to ${Math.round(scale * 100)}% for this session.`,
                e,
              );
              // Without this the browser is free to decline the restore, which
              // is the difference between a stutter and a dead canvas.
              e.preventDefault();
            };
            const onRestored = () => console.warn("[canvas] WebGL context restored");
            canvas.addEventListener("webglcontextlost", onLost);
            canvas.addEventListener("webglcontextrestored", onRestored);
          }}
        >
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
