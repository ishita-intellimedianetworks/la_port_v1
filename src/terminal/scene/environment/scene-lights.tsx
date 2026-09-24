'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/shared/stores/world-store';
import { useLightsStore } from '@/shared/stores/lights-store';
import type { LightsConfig, ResolvedLights } from '@/shared/types';

const DEFAULT_LIGHTS = {
  ambientIntensity: 0.8,
  ambientColor: '#ffffff',
  hemiIntensity: 0,
  hemiSkyColor: '#ffffff',
  hemiGroundColor: '#ffffff',
  envIntensity: 0.65,
  envFile: '/env.hdr',
  // No yaw by default — every venue that has not been dialled keeps exactly the
  // HDRI orientation it shipped with. See `LightsConfig.envRotation`.
  envRotation: 0,
  sunIntensity: 7.9,
  sunColor: '#ffffff',
  sunDirection: [-1.5, 5.9, -2.6] as [number, number, number],
  shadowMapSize: 1024,
  shadowRadius: 0.5,
  shadowBias: -0.0005,
  shadowNormalBias: 0.55,
  shadowFollowExtent: 420,
  spotIntensity: 12,
  spotColor: '#fff4e0',
  spotHeight: 0.6,
  spotAngle: 1.0,
  spotPenumbra: 0.5,
  spotDistance: 0,
  spotDecay: 2,
} as const;

// Shadow-camera geometry
// Scratch, reused across re-fits so walking allocates nothing.
const _corner = new THREE.Vector3();
const _snap = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _casters = new THREE.Box3();

function axisRange(box: THREE.Box3, origin: THREE.Vector3, axis: THREE.Vector3) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 8; i++) {
    const d = _corner
      .set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      )
      .sub(origin)
      .dot(axis);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return { lo, hi };
}

const FOLLOW_MARGIN = 0.2;

const FOLLOW_SETTLE = 1.5;

const RESTREAM_SAMPLE_FRAMES = 15;
const RESTREAM_MIN_INTERVAL = 0.5;

export default function SceneLights({
  shadows = true,
  lights,
  venueKey = "_",
  interior = false,
  follow = false,
  followRadius,
  envOverride,
}: {
  shadows?: boolean;
  lights?: LightsConfig;
  venueKey?: string;
  /** Interior floor — adds a shadow-casting point light inside the room (the
   *  sun is blocked by the ceiling) and disables the directional shadow. */
  interior?: boolean;
  follow?: boolean;
  followRadius?: number;
  envOverride?: Partial<ResolvedLights>;
}) {
  const scene = useThree((s) => s.scene);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef(new THREE.Object3D());
  const spotTargetRef = useRef(new THREE.Object3D());
  const version = useWorldStore((s) => s.version);

  const base = useMemo<ResolvedLights>(() => {
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
  const override = useLightsStore((s) => s.override);
  const debug = useLightsStore((s) => s.debug);
  const L = useMemo<ResolvedLights>(() => {
    let src = controlsEnabled && liveValues ? liveValues : base;
    // The sky's own lighting comes first so the live panel (and the /lighting
    // presets) can still overrule it.
    if (envOverride) src = { ...src, ...envOverride };
    if (override) src = { ...src, ...override };
    return debug ? { ...src, ...debug } : src;
  }, [controlsEnabled, liveValues, base, envOverride, override, debug]);

  const publishResolved = useLightsStore((s) => s.publishResolved);
  // Same precedence as `debug`: the panel's toggle wins outright, and null
  // means it has not been touched, not "off".
  const debugShadows = useLightsStore((s) => s.debugShadows);
  const effShadows =
    debugShadows ?? (controlsEnabled && liveValues ? liveShadows : shadows);

  useEffect(() => {
    publishResolved(L, effShadows);
  }, [publishResolved, L, effShadows]);

  const lightDir = useMemo(
    () => new THREE.Vector3(...L.sunDirection).normalize(),
    [L.sunDirection],
  );

  const envRotation = useMemo(
    () => new THREE.Euler(0, (L.envRotation * Math.PI) / 180, 0),
    [L.envRotation],
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

  const basis = useMemo(() => {
    const z = lightDir.clone();
    const up =
      Math.abs(z.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return { x, y, z };
  }, [lightDir]);

  /** Point the sun at `centre` with a square of +/-`extent`, and fit near/far to
   *  `casters`. Does NOT redraw the map - the caller decides when. */
  const aimSun = useCallback(
    (centre: THREE.Vector3, extent: number, casters: THREE.Box3, snap: boolean) => {
      const light = lightRef.current;
      if (!light) return;
      const { x, y, z } = basis;

      if (snap) {
        const texel = (extent * 2) / L.shadowMapSize;
        _snap
          .set(0, 0, 0)
          .addScaledVector(x, Math.round(centre.dot(x) / texel) * texel)
          .addScaledVector(y, Math.round(centre.dot(y) / texel) * texel)
          .addScaledVector(z, centre.dot(z));
      } else {
        _snap.copy(centre);
      }

      const { lo, hi } = axisRange(casters, _snap, z);
      // Stand the camera just outside the nearest caster, so near is tiny and
      // the depth range is only as deep as the geometry actually is.
      const pad = Math.max(1, extent * 0.01);
      const dist = hi + pad;

      light.position.copy(_snap).addScaledVector(z, dist);
      targetRef.current.position.copy(_snap);
      targetRef.current.updateMatrixWorld();
      light.target = targetRef.current;

      const cam = light.shadow.camera;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.near = pad;
      cam.far = dist - lo;
      cam.updateProjectionMatrix();
    },
    [basis, L.shadowMapSize],
  );

  const followActive = follow && effShadows && !interior;

  const followExtent = useMemo(
    () =>
      followRadius !== undefined
        ? followRadius / (1 - FOLLOW_MARGIN)
        : L.shadowFollowExtent,
    [followRadius, L.shadowFollowExtent],
  );

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const bounds = useWorldStore.getState().bounds;
    const center = bounds ? new THREE.Vector3(...bounds.center) : new THREE.Vector3();
    const radius = bounds ? bounds.radius : 50;

    targetRef.current.position.copy(center);
    targetRef.current.updateMatrixWorld();
    light.target = targetRef.current;
    light.position.copy(center).addScaledVector(lightDir, radius * 2.5);

    // Floors with `shadows: false` (e.g. the stadium) get the sun for lighting but
    // no shadow map - zero shadow cost. castShadow is driven by the JSX prop below.
    if (!effShadows) return;
    if (followActive) return;

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
      if (bounds) {
        _casters.set(
          new THREE.Vector3(...bounds.min),
          new THREE.Vector3(...bounds.max),
        );
      } else {
        _casters.setFromCenterAndSize(
          center,
          new THREE.Vector3(radius * 2, radius * 2, radius * 2),
        );
      }
      const { x, y, z } = basis;
      let loX = Infinity;
      let hiX = -Infinity;
      let loY = Infinity;
      let hiY = -Infinity;
      for (let i = 0; i < 8; i++) {
        _corner.set(
          i & 1 ? _casters.max.x : _casters.min.x,
          i & 2 ? _casters.max.y : _casters.min.y,
          i & 4 ? _casters.max.z : _casters.min.z,
        );
        const px = _corner.dot(x);
        const py = _corner.dot(y);
        if (px < loX) loX = px;
        if (px > hiX) hiX = px;
        if (py < loY) loY = py;
        if (py > hiY) hiY = py;
      }
      const half = Math.max(hiX - loX, hiY - loY) * 0.5;
      const centre = new THREE.Vector3()
        .addScaledVector(x, (loX + hiX) * 0.5)
        .addScaledVector(y, (loY + hiY) * 0.5)
        .addScaledVector(z, center.dot(z));
      aimSun(centre, half, _casters, false);
      shadow = light.shadow;
    }
    if (!shadow) return;

    shadow.autoUpdate = false;
    let frame = 0;
    let raf = requestAnimationFrame(function pump() {
      shadow!.needsUpdate = true;
      if (frame++ < 8) raf = requestAnimationFrame(pump);
    });
    return () => cancelAnimationFrame(raf);
  }, [version, effShadows, lightDir, L, interior, followActive, aimSun, basis]);

  const followAt = useRef<THREE.Vector3 | null>(null);
  const settleAt = useRef(0);

  useEffect(() => {
    followAt.current = null;
    settleAt.current = 0;
  }, [followActive, version, lightDir, followExtent, L.shadowMapSize]);

  useFrame(({ camera, clock }) => {
    if (!followActive) return;
    const light = lightRef.current;
    const bounds = useWorldStore.getState().bounds;
    if (!light || !bounds) return;

    const extent = followExtent;
    const last = followAt.current;
    camera.getWorldPosition(_eye);
    const moved =
      !last ||
      Math.hypot(_eye.x - last.x, _eye.z - last.z) >
        extent * FOLLOW_MARGIN;
    const settled = settleAt.current > 0 && clock.elapsedTime >= settleAt.current;
    if (!moved && !settled) return;

    if (moved) {
      const centre = last ?? new THREE.Vector3();
      centre.set(
        _eye.x,
        (bounds.min[1] + bounds.max[1]) * 0.5,
        _eye.z,
      );
      followAt.current = centre;

      const { z } = basis;
      const height = bounds.max[1] - bounds.min[1];
      const reach = (height * Math.hypot(z.x, z.z)) / Math.max(0.05, z.y);
      const pad = extent + reach;
      _casters.min.set(
        Math.max(bounds.min[0], centre.x - pad),
        bounds.min[1],
        Math.max(bounds.min[2], centre.z - pad),
      );
      _casters.max.set(
        Math.min(bounds.max[0], centre.x + pad),
        bounds.max[1],
        Math.min(bounds.max[2], centre.z + pad),
      );
      aimSun(centre, extent, _casters, true);
      settleAt.current = clock.elapsedTime + FOLLOW_SETTLE;
    } else {
      settleAt.current = 0;
    }

    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  });

  const sampleTick = useRef(0);
  const sampleCount = useRef(-1);
  const sampleNext = useRef(0);

  useFrame(({ clock }) => {
    if (!effShadows) return;
    if (++sampleTick.current % RESTREAM_SAMPLE_FRAMES) return;

    const count = scene.children.length;
    if (count === sampleCount.current) return;
    // Rate limit WITHOUT recording the count, so a change that arrives inside
    // the window is redrawn on the next sample rather than dropped.
    if (clock.elapsedTime < sampleNext.current) return;

    sampleCount.current = count;
    sampleNext.current = clock.elapsedTime + RESTREAM_MIN_INTERVAL;

    // Whichever light is actually casting here — indoors the sun is blocked by
    // the ceiling and the spot is the caster.
    const shadow = interior ? spotRef.current?.shadow : lightRef.current?.shadow;
    if (shadow) shadow.needsUpdate = true;
  });

  return (
    <>
      <ambientLight intensity={L.ambientIntensity} color={L.ambientColor} />
      {/* Sky fill — keeps the side facing away from the sun off black without
          flattening the lit side. Casts nothing; skipped entirely at 0. */}
      {L.hemiIntensity > 0 && (
        <hemisphereLight
          intensity={L.hemiIntensity}
          color={L.hemiSkyColor}
          groundColor={L.hemiGroundColor}
        />
      )}
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
      <Environment
        key={L.envFile}
        files={L.envFile}
        environmentIntensity={L.envIntensity}
        environmentRotation={envRotation}
        backgroundRotation={envRotation}
        background={interior}
        backgroundBlurriness={0}
      />
    </>
  );
}
