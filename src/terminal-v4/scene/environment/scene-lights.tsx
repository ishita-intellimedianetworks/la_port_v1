'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from '@/shared/stores/world-store';
import { useLightsStore } from '@/shared/stores/lights-store';
import type { LightsConfig, ResolvedLights } from '@/shared/types';

// Shared lighting + shadow defaults — dialled in via the Leva panel and baked
// here. Any `lights` block in the site file overrides these field by
// field; whatever a venue omits falls back to the value below.
const DEFAULT_LIGHTS = {
  ambientIntensity: 0.8,
  ambientColor: '#ffffff',
  // Sky fill: off by default, so nothing that does not ask for it changes. The
  // procedural sky turns it on and colours it from its own palette — see
  // `LightsConfig.hemiIntensity` for why ambient cannot do this job.
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
  // FALLBACK half-width of the square of ground the sun's shadow map covers
  // while WALKING, used only when the floor streams nothing. A streamed floor
  // derives it from where its fog closes instead — see `followExtent` below,
  // and the type doc for why this is not simply the visible radius.
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
const _casters = new THREE.Box3();

/** Range of `box` along `axis`, measured from a plane through `origin`.
 *  This is what near/far want: they bound what can CAST, and keeping that
 *  range tight is what makes `shadowBias` usable — bias is in NORMALISED depth,
 *  so the same -0.0005 is 1.4 m of peter-panning across a 2.8 km range and
 *  0.2 m across a 400 m one. */
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

// Fraction of the follow square the camera may cross before the sun is re-fitted
// and the shadow map redrawn. A redraw is a full depth pass over the resident
// geometry, so it must not be per-frame; at 0.2 of a 680 m square that is one
// redraw per ~68 m walked, and everything inside the square stays correct in
// between.
const FOLLOW_MARGIN = 0.2;

// Seconds after a re-fit at which the map is drawn once more. Streamed chunks
// keep landing after the redraw, and a frozen map does not know about the ones
// that arrived late — walking redraws often enough on its own, standing still
// does not.
const FOLLOW_SETTLE = 1.5;

// Keeping a frozen map honest while the world streams in
// The one-shot pump below freezes the shadow map eight frames after the lights
// are fitted. On a cold load that is long before the port has streamed, so the
// frozen map holds the shadows of almost nothing — and NOTHING ever redraws it,
// because `version` tracks the model BOUNDS, which are published once from the
// manifest and never again. The symptom is a scene that looks wrong until you
// touch any unrelated control, because a re-render is what re-runs the fit.
// Chunks mount and unmount straight onto the scene with no store and no event,
// so the cheapest true signal is how many objects the scene is holding. Sampled
// every few frames and rate-limited, a burst of arriving chunks costs one depth
// pass rather than one per chunk.
const RESTREAM_SAMPLE_FRAMES = 15;
const RESTREAM_MIN_INTERVAL = 0.5;

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
  /** On foot. Makes the sun's shadow square track the camera at
   *  `shadowFollowExtent` instead of covering the whole site — see the note on
   *  the fitting effect. False in the dollhouse, which wants the whole site. */
  follow?: boolean;
  /** Distance at which the world stops being VISIBLE at all on foot - the
   *  streamed fog's far plane. The follow square is sized from this, so the
   *  square can never end inside what you can still see. Undefined on a
   *  first-person floor that does not stream; `shadowFollowExtent` covers that. */
  followRadius?: number;
  /** Lighting the BACKDROP dictates — the procedural sky's sun direction and
   *  its time-of-day tint (see SceneEnvironment). Merged over the venue config
   *  but UNDER the live panel override, so a hand edit still wins. */
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
  // An environment-mode override (the /lighting dusk/night presets) merges over
  // whichever source is active. It is null everywhere else, and the memo then
  // returns the source object itself — identical identity + values to before.
  const override = useLightsStore((s) => s.override);
  // The `?debug=true` panel's edits. LAST, above the sky — a field it pins has
  // to survive the next time-of-day change, and merging it any earlier would
  // let `sky.lights` quietly put the old value back. Sparse, so untouched
  // fields still track the palette.
  const debug = useLightsStore((s) => s.debug);
  const L = useMemo<ResolvedLights>(() => {
    let src = controlsEnabled && liveValues ? liveValues : base;
    // The sky's own lighting comes first so the live panel (and the /lighting
    // presets) can still overrule it.
    if (envOverride) src = { ...src, ...envOverride };
    if (override) src = { ...src, ...override };
    return debug ? { ...src, ...debug } : src;
  }, [controlsEnabled, liveValues, base, envOverride, override, debug]);

  // Hand the fully-merged set back to the store so the debug panel can show
  // (and export) what is actually on screen rather than only its own edits.
  // `publishResolved` drops a write that changes nothing, which is what keeps
  // this from looping through the panel's own subscription.
  const publishResolved = useLightsStore((s) => s.publishResolved);
  // Same precedence as `debug`: the panel's toggle wins outright, and null
  // means it has not been touched, not "off".
  const debugShadows = useLightsStore((s) => s.debugShadows);
  const effShadows =
    debugShadows ?? (controlsEnabled && liveValues ? liveShadows : shadows);

  // Hand the fully-merged set back to the store so the debug panel can show
  // (and export) what is actually on screen rather than only its own edits.
  // `publishResolved` drops a write that changes nothing, which is what keeps
  // this from looping through the panel's own subscription.
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

  // Shadow-map TYPE is fixed globally to PCFShadowMap by the Canvas. We used to
  // flip interiors to PCFSoftShadowMap for softer in-room shadows, but that type
  // is DEPRECATED in this three build — it silently falls back to PCFShadowMap
  // AND logs a warning every single frame. So we no longer switch it; interiors
  // and exteriors share PCFShadowMap (soft edges come from `shadowRadius`/bias).

  // Fitting the sun's shadow camera
  // The sun's orthographic shadow camera covers a SQUARE of world, and its
  // resolution is that square's width divided by `shadowMapSize`. The reference
  // exterior fits that square to the whole model and freezes it, which is right
  // there because the whole model is a 140 m building - 2048 px across 140 m is
  // 7 cm per texel.
  // Doing the same here fits the square to a 2 km port: 1024 px across its
  // 2.8 km diagonal is 2.7 m per texel, so every shadow edge is a six-metre
  // staircase and most of the map is empty water. Nothing in the reference's
  // settings makes its shadows sharp; its site being small does.
  // So the square is fitted differently per view:
  //   dollhouse / interior -> the whole model, once, then frozen. Correct: the
  //     view frames the entire site, so at that zoom a texel is under a screen
  //     pixel anyway, and the scene is static.
  //   on foot (`follow`) -> +/-`shadowFollowExtent` around the camera. On foot
  //     the streamed world only EXISTS out to the unload radius (~330 m), so a
  //     square just past that loses nothing and gains ~4x finer texels at the
  //     same map size - no extra memory. It is re-fitted, and the map redrawn,
  //     only when the camera leaves the square's inner margin.
  // Both fit near/far to the geometry that can actually cast into the square
  // rather than to the bounding sphere, which is what lets shadows touch the
  // ground: `shadowBias` is normalised depth, so the old 2.8 km range turned
  // -0.0005 into 1.4 m of peter-panning.

  // The shadow camera's own basis. three builds it by pointing the camera from
  // the light at the target with up = +Y, so this must match, or the texel
  // snapping below would snap along the wrong axes.
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

      // Snap the square to whole texels along the light's own axes. Without it
      // each re-fit shifts the sampling grid by a fraction of a texel and every
      // shadow edge in the scene crawls as you walk.
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

  // How wide the follow square has to be.
  // Sizing it to the visible radius alone is NOT enough, and the failure is
  // subtle: the square only re-centres once the camera has crossed
  // `FOLLOW_MARGIN` of it, so between re-fits the camera sits up to that far
  // off-centre and the covered radius shrinks by the same amount. At a 340 m
  // square that is 68 m of drift - shadows stopped 281 m out while fog does not
  // close until 323 m, leaving a ring of bright, unshadowed ground sweeping
  // ahead of you. Dividing by (1 - margin) is exactly the amount that closes it.
  // Derived from the streaming fog rather than authored, so retuning the bands
  // can never silently re-open that ring. `shadowFollowExtent` is only the
  // fallback for a first-person floor that streams nothing.
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
    // On foot the frame loop below owns the sun's shadow camera: its whole-site
    // fit would be overwritten on the next frame anyway, and this effect's
    // 8-frame pump would fight the follow redraws.
    if (followActive) return;

    // The shadow CASTER differs by venue type:
    //   - exterior -> the directional sun (orthographic shadow camera);
    //   - interior -> a spot light INSIDE the room, aimed down at the floor. The
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
      // Smallest light-space square that still covers the model. For a wide,
      // flat site that is a good deal tighter than the bounding sphere the
      // reference uses - the port's sphere is 2.8 km across, its light-space
      // square 1.3 km - and tighter means finer texels for free.
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

    // Keep the shadow map frozen (static scene -> no per-frame cost / shimmer),
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
    // switches which light casts; `followActive` hands the sun to the frame loop
    // below and back.
  }, [version, effShadows, lightDir, L, interior, followActive, aimSun, basis]);

  // Follow fit: a square that walks with you
  // Re-centre on the camera and redraw the map only after it has left the
  // square's inner margin, plus once more a beat later to catch chunks that
  // streamed in after that redraw. Every other frame costs nothing: the map
  // stays frozen and the square is still around you.
  const followAt = useRef<THREE.Vector3 | null>(null);
  const settleAt = useRef(0);

  useEffect(() => {
    // Force a fit on the next frame whenever the mode or the tuning changes.
    // Deliberately the individual VALUES rather than `L` itself: `L` is a fresh
    // object whenever anything upstream re-renders, and a re-fit is a shadow-map
    // redraw — keyed on the object it would fire on renders that changed nothing
    // about the shadow, which at worst is a full depth pass every frame.
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
    const moved =
      !last ||
      Math.hypot(camera.position.x - last.x, camera.position.z - last.z) >
        extent * FOLLOW_MARGIN;
    const settled = settleAt.current > 0 && clock.elapsedTime >= settleAt.current;
    if (!moved && !settled) return;

    if (moved) {
      const centre = last ?? new THREE.Vector3();
      centre.set(
        camera.position.x,
        (bounds.min[1] + bounds.max[1]) * 0.5,
        camera.position.z,
      );
      followAt.current = centre;

      // Casters are the model, clipped to the square plus the distance a shadow
      // can travel INTO it - the sun's horizontal run per unit of height times
      // the model's height. Clipping keeps near/far tight; the padding keeps a
      // crane just outside the square from losing its shadow.
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

  // Redraw the frozen map when the resident set changes. Runs in BOTH fitting
  // modes: the static fit freezes outright, and the follow fit stops settling
  // 1.5 s after the last step — so standing still while the world streams in
  // leaves either of them stale.
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
        // Spin the HDRI about Y so its baked-in sun can be brought round to
        // where OUR sun is. Without it the reflections and the image-based fill
        // keep arriving from whichever bearing the photograph was taken at,
        // which is the mismatch that reads as "lit from the wrong side" no
        // matter where the directional light is pointed. A plain uniform on the
        // environment sampler — no reload, no extra memory.
        environmentRotation={envRotation}
        backgroundRotation={envRotation}
        background={interior}
        backgroundBlurriness={0}
      />
    </>
  );
}
