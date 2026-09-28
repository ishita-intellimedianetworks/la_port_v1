import { FunctionComponent, PropsWithChildren, Suspense, useEffect } from "react";
import { Canvas, useStore } from "@react-three/fiber";
import * as THREE from "three";

import { useSite } from "@/config/context";
import { sceneDataFor } from "@/shared/scene-data/adapter";
import isLowPower from "@/shared/runtime";
import { degradeGpuBudget } from "@/streaming/memory";
import { filterCss, useGradeStore } from "@/shared/stores/grade-store";

const isBenignShaderLog = (log: unknown) =>
  typeof log === "string" &&
  log.trim().length > 0 &&
  log
    .trim()
    .split("\n")
    .every((line) => line.trim() === "" || /\bwarning X4122\b/.test(line));

THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (type === "warn" && typeof message === "string") {
    if (message.startsWith("THREE.Clock: This module has been deprecated")) return;
    if (message.startsWith("THREE.WebGLProgram: Program Info Log") && isBenignShaderLog(params[0])) return;
  }
  const fn = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  fn(message, ...params);
});

const GradeExposure: FunctionComponent = () => {
  const store = useStore();
  const exposure = useGradeStore((s) => s.exposure);
  useEffect(() => {
    store.getState().gl.toneMappingExposure = exposure;
  }, [store, exposure]);
  return null;
};

const FPS_CAP = 60;
const FPS_CAP_LOW_POWER = 30;

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
  const site = useSite();
  const { entry } = sceneDataFor(site);
  const [px, py, pz] = initialPosition ?? entry.position;
  const [rx, ry, rz] = initialRotation ?? entry.rotation;
  const lowPower = isLowPower();
  const maxDpr = site.scene.stream.render.maxDpr;
  const toneMapping =
    site.scene.world.toneMapping === "none" ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  const brightness = useGradeStore((s) => s.brightness);
  const contrast = useGradeStore((s) => s.contrast);
  const saturation = useGradeStore((s) => s.saturation);
  const filter = filterCss({ brightness, contrast, saturation });

  return (
    <>
      <div className="w-full h-full">
        <Canvas
          shadows={lowPower ? false : { type: THREE.PCFShadowMap }}
          dpr={lowPower ? [1, Math.min(1.25, maxDpr)] : [1, maxDpr]}
          camera={{
            fov: site.scene.world.fov,
            near: 0.1,
            far: 10000,
            position: [px, py, pz],
            rotation: [rx, ry, rz],
          }}
          style={{
            height: "100%",
            width: "100%",
            position: "relative",
            touchAction: "none",
            filter,
          }}
          gl={{
            antialias: true,
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: lowPower ? THREE.NoToneMapping : toneMapping
          }}
          frameloop="demand"
          id="canvas-wrapper"
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            const onLost = (e: Event) => {
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
