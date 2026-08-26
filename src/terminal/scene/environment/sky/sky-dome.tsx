"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import isLowPower from "@/shared/runtime";
import { useSkyStore } from "@/terminal/stores/sky-store";
import { sampleSky } from "./palette";

/**
 * SkyDome — the `open-sea` study's analytic sky, running here as the backdrop.
 *
 * WHAT CHANGED IN THE PORT
 * The study is WebGPU + TSL + a bloom pass. This app is WebGL2, and the brief
 * was: no post-processing, no extra memory, nothing that costs frames. So:
 *
 *  • TSL → hand-written GLSL in ONE `ShaderMaterial`. Same maths, same
 *    constants — compare `main()` below with the study's `skyColor()`.
 *  • The sun disk is re-tuned. The study drew a 30× pinprick and let BLOOM turn
 *    it into a glowing orb. With no bloom that is a clipped white dot with a
 *    hard edge, so the disk is dimmed and softened and a tight `pow(s, 220)`
 *    inner glow stands in for the bloom halo. The wide `pow(s, 10) * 0.18`
 *    halo is the study's, untouched.
 *  • Geometry is a unit BOX (24 verts), not the study's 4000-unit sphere: it is
 *    parked on the camera every frame and drawn first with depth test AND depth
 *    write off, so it can never be clipped by the far plane and never occludes
 *    anything. Cost is 12 triangles and no depth traffic.
 *
 * MEMORY: one geometry, one material, one program, ZERO textures — the whole
 * sky is arithmetic. Nothing here allocates per frame.
 *
 * COST: one full-screen fragment pass of ~30 ALU ops. The cloud band is the
 * only expensive part (3-octave gradient noise) and is branch-guarded to the
 * thin strip of sky it actually occupies; on low-power devices it drops to
 * 2 octaves. It can be turned off entirely — `site.json › sky.clouds`, or the
 * `?debug=true` panel's checkbox.
 *
 * It also owns `scene.background`, easing it black → horizon colour on the same
 * curve as the dome's own fade. The dome hides the background completely, but
 * StreamFog reads it every frame to keep distance fog the same colour as the
 * sky it dissolves into — that rule is the reason the fog colour is not
 * authored, and it now tracks a real horizon instead of a flat blue.
 */

// Matches BackgroundFade's fade, which rode the dollhouse → first-person fly.
const FADE_SEC = 1.6;

// Half-extent of the box in world units. It only has to sit between the
// camera's near (0.1) and far (10000) planes; it follows the camera, so it
// never interacts with the scene's own (very large) units.
const DOME_SCALE = 100;

const BLACK = new THREE.Color(0x000000);

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // World-space view ray. Taken from the transformed vertex rather than the
    // box's local position so the dome is correct under any parent transform.
    vDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSun;      // colour x intensity
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uFade;    // 0 = black (dollhouse), 1 = full sky
  varying vec3 vDir;

  #ifdef SKY_CLOUDS
  vec2 hash2(vec2 p) {
    vec2 h = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(h) * 43758.5453) * 2.0 - 1.0;
  }

  // Gradient noise with the quintic curve f^3 * (f * (f * 6 - 15) + 10).
  float gradNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float n00 = dot(hash2(i), f);
    float n10 = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float n01 = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float n11 = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = gradNoise(p) + gradNoise(p * 2.04 + vec2(17.3, 9.1)) * 0.5;
    #ifndef SKY_CHEAP
    // Third octave is dropped on low-power devices: it is a 0.25-weight detail
    // inside a thin horizon band, and it is a third of the noise cost.
    v += gradNoise(p * 4.11 + vec2(42.7, 28.6)) * 0.25;
    #endif
    return v;
  }
  #endif

  void main() {
    vec3 dir = normalize(vDir);

    // Vertical gradient. pow(up, 0.42) keeps the horizon stop wide and the
    // zenith stop tight, which is what makes the dusk band read as a sunset
    // rather than a linear ramp.
    float up = clamp(dir.y, -0.15, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.42));

    // Below the horizon, fade into haze so downward rays never hit black.
    col = mix(col, uHaze, 1.0 - smoothstep(-0.15, 0.0, dir.y));

    float s = max(dot(dir, uSunDir), 0.0);
    col += uSun * pow(s, 10.0) * 0.18;                 // wide halo (verbatim)
    col += uSun * pow(s, 220.0) * 0.9;                 // inner glow, ex-bloom
    col += uSun * smoothstep(0.9990, 0.9997, s) * 6.0; // disk, softened

    #ifdef SKY_CLOUDS
    // A low band of cloud near the horizon. Guarded: outside the band the whole
    // noise field is skipped, and the band is a thin strip of the frame.
    float band = smoothstep(0.03, 0.16, dir.y) * (1.0 - smoothstep(0.22, 0.6, dir.y));
    if (band > 0.001) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 0.55;
      float n = fbm(uv + vec2(uTime * 0.006, uTime * 0.003)) * 0.5 + 0.5;
      float clouds = smoothstep(0.62, 0.95, n) * band;
      vec3 cloudColor = mix(vec3(0.92, 0.9, 0.87), uSun, 0.25);
      col = mix(col, cloudColor, clamp(clouds * 0.6, 0.0, 1.0));
    }
    #endif

    gl_FragColor = vec4(col * uFade, 1.0);

    // A raw ShaderMaterial gets neither of these for free — without them the
    // dome would sit in linear space while every other material in the scene is
    // tone-mapped and sRGB-encoded, and the sky would read washed out.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function SkyDome({
  sky,
}: {
  /** True once the sky should be visible (first person); false fades it to
   *  black for the dollhouse, where the model reads as an isolated object. */
  sky: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<THREE.Mesh>(null);
  // 0 = black (dollhouse), 1 = full sky; eased toward `sky`.
  const mix = useRef(0);

  // Time of day and the cloud band are LIVE (see `sky-store`) so the debug
  // panel can drive them; `site.json` only seeds them.
  const t = useSkyStore((s) => s.t);
  const clouds = useSkyStore((s) => s.clouds);

  // Rebuilt only when the cloud band is toggled, because that is a `#define`
  // and so a recompile. Moving the SUN is not: `t` writes uniform values
  // below, which is the discipline the study kept — "uniforms only, nothing is
  // ever rebuilt" — and is what makes the slider free to drag.
  const material = useMemo(() => {
    const defines: Record<string, string> = {};
    if (clouds) {
      defines.SKY_CLOUDS = "";
      if (isLowPower()) defines.SKY_CHEAP = "";
    }
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uTime: { value: 0 },
        uFade: { value: 0 },
      },
      side: THREE.BackSide,
      // Drawn first, writes no depth and tests none: the sky can never occlude
      // the scene and the scene always paints over it. That is also why the box
      // never has to be big enough to enclose the world.
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
  }, [clouds]);

  // The horizon colour the fog has to match, held where the frame loop can read
  // it without re-subscribing to the palette.
  const horizon = useRef(new THREE.Color());

  // Resolve the palette into the existing uniform objects. Their identity never
  // changes, so this costs no recompile and no reallocation on the GPU side.
  useEffect(() => {
    const s = sampleSky(t);
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).copy(s.zenith);
    (u.uHorizon.value as THREE.Color).copy(s.horizon);
    (u.uHaze.value as THREE.Color).copy(s.haze);
    (u.uSun.value as THREE.Color).copy(s.sun);
    (u.uSunDir.value as THREE.Vector3).copy(s.sunDir);
    horizon.current.copy(s.horizon);
  }, [t, material]);

  // The material is ours, not R3F's (it comes in as a prop, not a JSX child),
  // so its program is ours to release.
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const target = sky ? 1 : 0;
    const step = delta / FADE_SEC;
    mix.current =
      target > mix.current
        ? Math.min(target, mix.current + step)
        : Math.max(target, mix.current - step);
    const k = mix.current * mix.current * (3 - 2 * mix.current); // smoothstep

    material.uniforms.uFade.value = k;
    material.uniforms.uTime.value += delta;

    // Park the dome on the camera. Written through the parent transform so it
    // stays correct wherever the environment sits in the graph.
    mesh.position.copy(camera.position);
    mesh.parent?.worldToLocal(mesh.position);

    // The dome covers the background entirely; this is purely so StreamFog,
    // which samples `scene.background` every frame, fogs distant chunks to the
    // colour of the sky they dissolve into. Returning from an interior leaves a
    // texture there — swap a Color back in before writing.
    if (!(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(0x000000);
    }
    (scene.background as THREE.Color).copy(BLACK).lerp(horizon.current, k);
  });

  return (
    <mesh
      ref={meshRef}
      material={material}
      frustumCulled={false}
      renderOrder={-1000}
      scale={DOME_SCALE}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}
