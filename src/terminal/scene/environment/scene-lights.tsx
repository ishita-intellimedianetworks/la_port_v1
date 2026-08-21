'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/shared/stores/world-store';
import { useLightsStore } from '@/shared/stores/lights-store';
import type { LightsConfig, ResolvedLights } from '@/shared/types';

// Shared lighting + shadow defaults — dialled in via the Leva panel and baked
// here. Any per-venue `lights` block in scenes.json overrides these field by
// field; whatever a venue omits falls back to the value below.
const DEFAULT_LIGHTS = {
  ambientIntensity: 0.8,
  ambientColor: '#ffffff',
  envIntensity: 0.65,
  envFile: '/env.hdr',
  sunIntensity: 7.9,
  sunColor: '#ffffff',
  // Sun direction (normalised at runtime); the light position + its orthographic
  // shadow camera are fitted to the model bounds so the sun and shadows frame
  // whichever model is active, regardless of its world units.
  sunDirection: [-1.5, 5.9, -2.6] as [number, number, number],
  // Shadow map resolution (square). 1024 halves the shadow texture bandwidth
  // vs 2048 — the map is frozen after load, so the per-frame cost is the
  // full-screen PCF sampling, and smaller maps sample cheaper (better texture
  // cache locality). Visually near-identical at these venue scales because
  // shadowRadius blurs the edges anyway.
  shadowMapSize: 1024,
  shadowRadius: 0.5,
  shadowBias: -0.0005,
  shadowNormalBias: 0.55,
  // Interior spot light (only used on interior floors — see below).
  spotIntensity: 12,
  spotColor: '#fff4e0',
  spotHeight: 0.6,
  spotAngle: 1.0,
  spotPenumbra: 0.5,
  spotDistance: 0,
  spotDecay: 2,
} as const;

/**
 * SceneLights — ambient + a sun fitted to the model bounds, plus HDR image-based
 * lighting from `/env.hdr`. The directional light and its orthographic shadow
 * camera are sized from world-store bounds so the sun + shadows frame whichever
 * model is active. The shadow map is frozen after a one-shot render burst per
 * model load (static scene → no per-frame cost or shimmer while walking).
 *
 * Each venue can override any lighting/shadow value via its `lights` block in
 * scenes.json (see `LightsConfig`); unset fields use `DEFAULT_LIGHTS`.
 *
 * When the venue sets `lights.controls`, the resolved values are seeded into
 * `useLightsStore` and the live (panel-edited) values are rendered instead — so
 * the on-screen controls overlay drives the lighting in real time.
 */
export default function SceneLights({
  shadows = true,
  lights,
  venueKey = "_",
  interior = false,
}: {
  shadows?: boolean;
  lights?: LightsConfig;
  venueKey?: string;
  /** Interior floor — adds a shadow-casting point light inside the room (the
   *  sun is blocked by the ceiling) and disables the directional shadow. */
  interior?: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef(new THREE.Object3D());
  const spotTargetRef = useRef(new THREE.Object3D());
  const version = useWorldStore((s) => s.version);

  // Resolve this venue's config over the shared defaults once per lights change.
  const base = useMemo<ResolvedLights>(() => {
    // Drop the `controls` flag — it isn't a renderable light value.
    const overrides: LightsConfig = { ...lights };
    delete overrides.controls;
    return { ...DEFAULT_LIGHTS, ...overrides };
  }, [lights]);
  const controlsEnabled = !!lights?.controls;

  // Seed the live store for this venue. Keyed on venueKey so a venue switch
  // reloads its values; same-venue re-renders keep any live edits.
  const seed = useLightsStore((s) => s.seed);
  useEffect(() => {
    seed(venueKey, base, controlsEnabled, shadows);
  }, [seed, venueKey, base, controlsEnabled, shadows]);

  // When controls are on, render the live (panel-edited) values; otherwise the
  // static resolved config. Shadows can also be toggled live from the panel.
  const liveValues = useLightsStore((s) => s.values);
  const liveShadows = useLightsStore((s) => s.shadows);
  // An environment-mode override (the /lighting dusk/night presets) merges over
  // whichever source is active. It is null everywhere else, and the memo then
  // returns the source object itself — identical identity + values to before.
  const override = useLightsStore((s) => s.override);
  const L = useMemo<ResolvedLights>(() => {
    const src = controlsEnabled && liveValues ? liveValues : base;
    return override ? { ...src, ...override } : src;
  }, [controlsEnabled, liveValues, base, override]);
  const effShadows = controlsEnabled && liveValues ? liveShadows : shadows;

  const lightDir = useMemo(
    () => new THREE.Vector3(...L.sunDirection).normalize(),
    [L.sunDirection],
  );

  useEffect(() => {
    const target = targetRef.current;
    const spotTarget = spotTargetRef.current;
    scene.add(target);
    scene.add(spotTarget);
    return () => {
      scene.remove(target);
      scene.remove(spotTarget);
    };
  }, [scene]);

  // Shadow-map TYPE is fixed globally to PCFShadowMap by the Canvas. We used to
  // flip interiors to PCFSoftShadowMap for softer in-room shadows, but that type
  // is DEPRECATED in this three build — it silently falls back to PCFShadowMap
  // AND logs a warning every single frame. So we no longer switch it; interiors
  // and exteriors share PCFShadowMap (soft edges come from `shadowRadius`/bias).

  // Fit the sun + its orthographic shadow camera to the active model's bounds,
  // then re-render the (frozen) shadow map. Re-runs on each model load.
  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const bounds = useWorldStore.getState().bounds;
    // Fall back to a sane framing before the first model bounds arrive.
    const center = bounds ? new THREE.Vector3(...bounds.center) : new THREE.Vector3();
    const radius = bounds ? bounds.radius : 50;

    targetRef.current.position.copy(center);
    targetRef.current.updateMatrixWorld();
    light.target = targetRef.current;

    const dist = radius * 2.5;
    light.position.copy(center).addScaledVector(lightDir, dist);

    // Floors with `shadows: false` (e.g. the stadium) get the sun for lighting but
    // no shadow map — zero shadow cost. castShadow is driven by the JSX prop below.
    if (!effShadows) return;

    // The shadow CASTER differs by venue type:
    //   • exterior → the directional sun (orthographic shadow camera);
    //   • interior → a spot light INSIDE the room, aimed down at the floor. The
    //     sun is blocked by the ceiling indoors, so its shadow map would be
    //     empty; the ceiling spot below actually casts furniture/floor shadows.
    const spot = spotRef.current;
    let shadow: THREE.LightShadow | null = null;

    if (interior && spot) {
      // Hang the fixture above the room's centre (toward the ceiling) and aim it
      // straight down at the floor centre.
      spot.position.set(center.x, center.y + L.spotHeight, center.z);
      spotTargetRef.current.position.set(center.x, center.y - radius, center.z);
      spotTargetRef.current.updateMatrixWorld();
      spot.target = spotTargetRef.current;
      const scam = spot.shadow.camera as THREE.PerspectiveCamera;
      scam.near = Math.max(0.05, radius * 0.02);
      scam.far = radius * 3;
      scam.updateProjectionMatrix();
      shadow = spot.shadow;
    } else if (!interior) {
      const cam = light.shadow.camera;
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.near = Math.max(0.1, dist - radius);
      cam.far = dist + radius;
      cam.updateProjectionMatrix();
      shadow = light.shadow;
    }
    if (!shadow) return;

    // Keep the shadow map frozen (static scene → no per-frame cost / shimmer),
    // but pump a few renders after each (re)fit so the frozen map captures the
    // model before it stops re-rendering.
    shadow.autoUpdate = false;
    let frame = 0;
    let raf = requestAnimationFrame(function pump() {
      shadow!.needsUpdate = true;
      if (frame++ < 8) raf = requestAnimationFrame(pump);
    });
    return () => cancelAnimationFrame(raf);
    // Re-run on any live lighting change (`L` is a fresh object per panel edit)
    // so the frozen shadow map re-pumps to reflect new bias / radius / map size /
    // sun direction. `effShadows` toggles the whole shadow path live; `interior`
    // switches which light casts.
  }, [version, effShadows, lightDir, L, interior]);

  return (
    <>
      <ambientLight intensity={L.ambientIntensity} color={L.ambientColor} />
      <directionalLight
        ref={lightRef}
        intensity={L.sunIntensity}
        color={L.sunColor}
        // Indoors the sun lights the model but does NOT cast — the point light
        // below is the interior shadow caster (the sun can't reach inside).
        castShadow={effShadows && !interior}
        shadow-mapSize-width={L.shadowMapSize}
        shadow-mapSize-height={L.shadowMapSize}
        shadow-bias={L.shadowBias}
        shadow-normalBias={L.shadowNormalBias}
        shadow-radius={L.shadowRadius}
      />
      {/* Interior ceiling spot — hung above the room (positioned in the effect)
          and aimed down at the floor so it casts shadows of the furniture.
          Rendered only on interior floors; exteriors keep just the sun. */}
      {interior && (
        <spotLight
          ref={spotRef}
          intensity={L.spotIntensity}
          color={L.spotColor}
          angle={L.spotAngle}
          penumbra={L.spotPenumbra}
          distance={L.spotDistance}
          decay={L.spotDecay}
          castShadow={effShadows}
          shadow-mapSize-width={L.shadowMapSize}
          shadow-mapSize-height={L.shadowMapSize}
          shadow-bias={L.shadowBias}
          shadow-normalBias={L.shadowNormalBias}
          shadow-radius={L.shadowRadius}
        />
      )}
      {/* `key` forces a reload when the HDRI path changes (e.g. exterior↔interior
          city HDRI) — drei caches by url, so the key swap remounts cleanly.
          Interiors show the HDR itself as the (sharp) background — seen through
          windows in place of the exterior sky; exteriors keep the Sky backdrop. */}
      <Environment
        key={L.envFile}
        files={L.envFile}
        environmentIntensity={L.envIntensity}
        background={interior}
        backgroundBlurriness={0}
      />
    </>
  );
}
