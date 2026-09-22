"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import isLowPower from "@/shared/runtime";
import { useSkyStore } from "@/terminal-v5/stores/sky-store";
import { sampleSky, SKY_HORIZON } from "./palette";

const FADE_SEC = 1.6;

const DOME_SCALE = 100;

const BLACK = new THREE.Color(0x000000);

const vertexShader = `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uFade;
  varying vec3 vDir;

  #ifdef SKY_CLOUDS
  vec2 hash2(vec2 p) {
    vec2 h = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(h) * 43758.5453) * 2.0 - 1.0;
  }

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
    v += gradNoise(p * 4.11 + vec2(42.7, 28.6)) * 0.25;
    #endif
    return v;
  }
  #endif

  void main() {
    vec3 dir = normalize(vDir);

    float up = clamp(dir.y, -0.15, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.42));

    col = mix(col, uHaze, 1.0 - smoothstep(-0.15, 0.0, dir.y));

    float s = max(dot(dir, uSunDir), 0.0);
    col += uSun * pow(s, 10.0) * 0.18;
    col += uSun * pow(s, 220.0) * 0.9;
    col += uSun * smoothstep(0.9990, 0.9997, s) * 6.0;

    #ifdef SKY_CLOUDS
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

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function SkyDome({
  sky,
}: {
  sky: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<THREE.Mesh>(null);
  const mix = useRef(0);

  const t = useSkyStore((s) => s.t);
  const clouds = useSkyStore((s) => s.clouds);
  const aimed = useSkyStore((s) => s.sunUnlinked);
  const aimAz = useSkyStore((s) => s.sunAzimuth);
  const aimEl = useSkyStore((s) => s.sunElevation);
  const aim = useMemo(
    () =>
      aimed
        ? { azimuth: (aimAz * Math.PI) / 180, elevation: (aimEl * Math.PI) / 180 }
        : null,
    [aimed, aimAz, aimEl],
  );

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
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
  }, [clouds]);

  const horizon = useRef(new THREE.Color());

  useEffect(() => {
    const s = sampleSky(t, aim);
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).copy(s.zenith);
    (u.uHorizon.value as THREE.Color).copy(s.horizon);
    (u.uHaze.value as THREE.Color).copy(s.haze);
    (u.uSun.value as THREE.Color).copy(s.sun);
    (u.uSunDir.value as THREE.Vector3).copy(s.sunDir);
    horizon.current.copy(s.horizon);
    SKY_HORIZON.color.copy(s.horizon);
    SKY_HORIZON.isSet = true;
  }, [t, aim, material]);

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
    const k = mix.current * mix.current * (3 - 2 * mix.current);

    material.uniforms.uFade.value = k;
    material.uniforms.uTime.value += delta;

    mesh.position.copy(camera.position);
    mesh.parent?.worldToLocal(mesh.position);

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
