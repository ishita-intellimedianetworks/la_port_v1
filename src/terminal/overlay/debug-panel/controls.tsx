"use client";

/**
 * The `?debug=true` lighting panel, as Leva controls.
 *
 * WHAT DRIVES WHAT
 * Nothing here owns state. Every input writes the store the renderer already
 * reads — `sky-store` for the dome, `lights-store` for SceneLights,
 * `grade-store` for the canvas — so `site.json` still decides what the page
 * LOADS with and this only overrides it for the run.
 *
 * Light edits land in `lights-store.debug`, a layer merged LAST. That is not
 * incidental: `values` (the old `lights.controls` path) is merged UNDER the
 * sky, so a `sunIntensity` set there is replaced by `sky.lights` on the next
 * render and the control looks broken. `debug` is also SPARSE — only fields
 * actually touched — so moving the time-of-day slider afterwards still re-tints
 * everything that has not been pinned.
 *
 * THE TWO-WAY PROBLEM
 * Leva owns its own state, and four of these values are DERIVED from the sky
 * every time `t` moves. So the sync runs both ways: user edits go out through
 * `onChange`, and the derived colours come back in through `set()` for as long
 * as they are unpinned. Every `onChange` is guarded on `ctx.fromPanel`, because
 * `set()` fires them too and without the guard the first sync would pin all
 * four colours by itself.
 *
 * Seeded from the first RESOLVED light set rather than from config, so the
 * sliders open on what is actually on screen. That is why the parent waits for
 * it before mounting this.
 */

import { useCallback, useEffect, useRef } from "react";
import { button, folder, useControls } from "leva";
import { GRADE_SEED, useGradeStore } from "@/shared/stores/grade-store";
import { useLightsStore } from "@/shared/stores/lights-store";
import { SKY_MODE, SKY_T_SEED, useSkyStore } from "@/terminal/stores/sky-store";
import { T_FOR_MODE, sunAnglesForT } from "../../scene/environment/sky/palette";
import type { ResolvedLights } from "@/shared/types";
import { buildDebugJson } from "./debug-json";

/** Colours the sky derives from its palette on every `t` change. These are the
 *  ones that have to be pushed BACK into the panel, and the only ones. */
const DERIVED = ["ambientColor", "hemiSkyColor", "hemiGroundColor", "sunColor"] as const;

/** Elevation runs 15°..85° — exactly the palette's own clamps. Anything wider
 *  would be dead travel: the floor is shadow acne (a shadow map's depth error
 *  goes as 1/tan(elevation)), the ceiling is that a vertical sun casts its
 *  shadows straight down under everything. */
const EL_MIN = 15;
const EL_MAX = 85;

/** Leva's setter, addressed by flat leaf key. */
type Setter = (patch: Record<string, unknown>) => void;

export default function DebugControls({ seed }: { seed: ResolvedLights }) {
  const sky = useSkyStore;
  const setDebugField = useLightsStore((s) => s.setDebugField);
  const setDebugShadows = useLightsStore((s) => s.setDebugShadows);
  const clearDebug = useLightsStore((s) => s.clearDebug);
  const setGrade = useGradeStore((s) => s.set);
  const resolved = useLightsStore((s) => s.resolved);
  const debug = useLightsStore((s) => s.debug);

  /**
   * Pushing values back INTO the panel, through a ref.
   *
   * The schema below is built once (leva memoises it), and several of its
   * callbacks need to write back — so they would have to capture leva's `set`
   * from a `const` declared after the very call that creates them. That works
   * only because they fire later, which is the kind of thing that stops being
   * true the moment someone reorders two lines. The ref is filled in after
   * mount and every callback goes through this stable wrapper instead.
   */
  const setRef = useRef<Setter>(() => {});
  const push = useCallback<Setter>((patch) => setRef.current(patch), []);

  /** One light field. `fromPanel` keeps a programmatic `set()` from counting as
   *  an edit, which is what would otherwise pin every derived colour on sync. */
  const light =
    <K extends keyof ResolvedLights>(key: K) =>
    (v: ResolvedLights[K], _path: string, ctx?: { fromPanel?: boolean }) => {
      if (!ctx?.fromPanel) return;
      setDebugField(key, v);
    };

  const [, setTyped] = useControls(() => ({
    "time of day": folder(
      {
        t: {
          value: SKY_T_SEED,
          min: 0,
          max: 1,
          step: 0.001,
          onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) sky.getState().setT(v);
          },
        },
        dusk: button(() => sky.getState().setT(T_FOR_MODE.dusk)),
        afternoon: button(() => sky.getState().setT(T_FOR_MODE.afternoon)),
        midday: button(() => sky.getState().setT(T_FOR_MODE.day)),
        "horizon clouds": {
          value: sky.getState().clouds,
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) sky.getState().setClouds(v);
          },
        },
      },
      { collapsed: SKY_MODE === "off" },
    ),

    // Unlinked, `t` stops reaching the sun: these two angles place the disk
    // drawn in the dome AND aim the shadow-casting light, which read one
    // `sunAngles` answer and so cannot disagree. Colours stay on `t`.
    sun: folder({
      "unlink from time of day": {
        value: sky.getState().sunUnlinked,
        onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (!ctx?.fromPanel) return;
          sky.getState().setSunUnlinked(v);
          // Unlinking seeds the angles from where `t` has the sun, so nothing
          // jumps — push those back into the panel or it would keep showing
          // whatever the sliders happened to be on.
          const a = sunAnglesForT(sky.getState().t);
          push({ azimuth: a.azimuth, elevation: a.elevation });
        },
      },
      azimuth: {
        value: sky.getState().sunAzimuth,
        min: -180,
        max: 180,
        step: 1,
        hint: "compass bearing of the sun; 0 points it toward −Z",
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) sky.getState().setSunAzimuth(v);
        },
      },
      elevation: {
        value: sky.getState().sunElevation,
        min: EL_MIN,
        max: EL_MAX,
        step: 1,
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) sky.getState().setSunElevation(v);
        },
      },
      "match sky sun": button(() => {
        sky.getState().matchSunToSky();
        const s = sky.getState();
        push({ azimuth: s.sunAzimuth, elevation: s.sunElevation });
      }),
      "sun vector": { value: fmtVec(seed.sunDirection), editable: false },
    }),

    // The HDRI is a photograph with its own sun baked in at a fixed bearing, and
    // it supplies the reflections plus a large share of the fill. Nothing about
    // moving the procedural sun moves it — so without this yaw the two suns sit
    // wherever they happen to, and the model reads as lit from a direction with
    // no sun over it.
    environment: folder({
      "env intensity": {
        value: seed.envIntensity,
        min: 0,
        max: 3,
        step: 0.01,
        onChange: light("envIntensity"),
      },
      "env yaw": {
        value: seed.envRotation,
        min: -180,
        max: 180,
        step: 1,
        hint: "spins the HDRI so its baked-in sun lines up with ours",
        onChange: light("envRotation"),
      },
      // One-shot rather than a live link: where the HDRI's own sun sits is a
      // property of the image and cannot be derived, so this only gets you to
      // the same bearing — nudge from there, then paste the number back.
      "match sun": button(() => {
        const v = sky.getState().sunUnlinked
          ? sky.getState().sunAzimuth
          : sunAnglesForT(sky.getState().t).azimuth;
        setDebugField("envRotation", Math.round(v));
        push({ "env yaw": Math.round(v) });
      }),
      "env file": { value: seed.envFile, editable: false },
    }),

    ambient: folder({
      "ambient intensity": {
        value: seed.ambientIntensity,
        min: 0,
        max: 3,
        step: 0.01,
        onChange: light("ambientIntensity"),
      },
      ambientColor: { value: seed.ambientColor, label: "ambient colour", onChange: light("ambientColor") },
      // Sky fill is a hemisphere light: full strength on up-facing surfaces,
      // ground colour underneath. It is what keeps the away-from-sun side off
      // black — raising ambient instead flattens the lit side into paper.
      "sky fill": {
        value: seed.hemiIntensity,
        min: 0,
        max: 4,
        step: 0.01,
        onChange: light("hemiIntensity"),
      },
      hemiSkyColor: { value: seed.hemiSkyColor, label: "fill above", onChange: light("hemiSkyColor") },
      hemiGroundColor: { value: seed.hemiGroundColor, label: "fill below", onChange: light("hemiGroundColor") },
    }),

    "sun light": folder({
      "sun intensity": {
        value: seed.sunIntensity,
        min: 0,
        max: 20,
        step: 0.1,
        onChange: light("sunIntensity"),
      },
      sunColor: { value: seed.sunColor, label: "sun colour", onChange: light("sunColor") },
    }),

    shadows: folder(
      {
        "cast shadows": {
          value: useLightsStore.getState().resolvedShadows,
          onChange: (v: boolean, _p: string, ctx?: { fromPanel?: boolean }) => {
            if (ctx?.fromPanel) setDebugShadows(v);
          },
        },
        "map size": {
          value: seed.shadowMapSize,
          options: [512, 1024, 2048, 4096],
          onChange: light("shadowMapSize"),
        },
        blur: {
          value: seed.shadowRadius,
          min: 0,
          max: 8,
          step: 0.1,
          onChange: light("shadowRadius"),
        },
        // Lives in ten-thousandths: bias is NORMALISED depth, so the useful
        // range is this narrow no matter how large the site is.
        bias: {
          value: seed.shadowBias,
          min: -0.005,
          max: 0.005,
          step: 0.0001,
          onChange: light("shadowBias"),
        },
        "normal bias": {
          value: seed.shadowNormalBias,
          min: 0,
          max: 3,
          step: 0.01,
          onChange: light("shadowNormalBias"),
        },
        "follow extent": {
          value: seed.shadowFollowExtent,
          min: 50,
          max: 1500,
          step: 10,
          hint: "half-width of the ground the shadow map covers on foot",
          onChange: light("shadowFollowExtent"),
        },
      },
      { collapsed: true },
    ),

    // Interior floors only — out on the port the spot is not even mounted.
    "interior spot": folder(
      {
        "spot intensity": {
          value: seed.spotIntensity,
          min: 0,
          max: 60,
          step: 0.5,
          onChange: light("spotIntensity"),
        },
        spotColor: { value: seed.spotColor, label: "spot colour", onChange: light("spotColor") },
        "spot height": {
          value: seed.spotHeight,
          min: 0,
          max: 5,
          step: 0.05,
          onChange: light("spotHeight"),
        },
        "cone angle": {
          value: seed.spotAngle,
          min: 0.05,
          max: 1.5,
          step: 0.01,
          onChange: light("spotAngle"),
        },
        penumbra: {
          value: seed.spotPenumbra,
          min: 0,
          max: 1,
          step: 0.01,
          onChange: light("spotPenumbra"),
        },
        "spot distance": {
          value: seed.spotDistance,
          min: 0,
          max: 200,
          step: 1,
          onChange: light("spotDistance"),
        },
        "spot decay": {
          value: seed.spotDecay,
          min: 0,
          max: 4,
          step: 0.1,
          onChange: light("spotDecay"),
        },
      },
      { collapsed: true },
    ),

    // `exposure` is a renderer uniform applied in HDR BEFORE tone mapping — it
    // is free and its highlights roll off. The other three are a CSS filter over
    // the finished 8-bit image: a full-screen composite that can band, and which
    // is not emitted at all while all three are 0.
    grade: folder({
      exposure: {
        value: GRADE_SEED.exposure,
        min: 0.2,
        max: 2.5,
        step: 0.01,
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setGrade({ exposure: v });
        },
      },
      brightness: {
        value: GRADE_SEED.brightness,
        min: -0.5,
        max: 0.5,
        step: 0.01,
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setGrade({ brightness: v });
        },
      },
      contrast: {
        value: GRADE_SEED.contrast,
        min: -0.5,
        max: 0.5,
        step: 0.01,
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setGrade({ contrast: v });
        },
      },
      saturation: {
        value: GRADE_SEED.saturation,
        min: -1,
        max: 1,
        step: 0.01,
        onChange: (v: number, _p: string, ctx?: { fromPanel?: boolean }) => {
          if (ctx?.fromPanel) setGrade({ saturation: v });
        },
      },
      neutral: button(() => {
        setGrade({ exposure: 1, brightness: 0, contrast: 0, saturation: 0 });
        push({ exposure: 1, brightness: 0, contrast: 0, saturation: 0 });
      }),
    }),

    export: folder({
      // Straight to the clipboard, and to the console as well so it survives a
      // clipboard permission the browser declines.
      "copy JSON": button(() => {
        const json = buildDebugJson();
        console.log("[debug] lighting JSON\n" + json);
        navigator.clipboard?.writeText(json).catch(() => {});
      }),
      // Drops every pinned field at once; the scene falls straight back to
      // config plus whatever the sky derives.
      "unpin all": button(() => clearDebug()),
    }),
  }));

  // Leva's `set` takes FLAT leaf keys — `folder()` namespaces the store path but
  // not the key you address, and it warns on duplicates across folders, which is
  // why every key above is unique. Its TYPE only sees the keys it can pull back
  // out through `FolderInput`, so the cast is the honest way to say "leva's own
  // typing is narrower than leva".
  useEffect(() => {
    setRef.current = setTyped as unknown as Setter;
  }, [setTyped]);

  // Derived colours flow BACK while they are unpinned, so moving the time of
  // day visibly re-tints the swatches instead of leaving four stale hexes.
  useEffect(() => {
    if (!resolved) return;
    const patch: Record<string, string> = {};
    for (const k of DERIVED) {
      if (!debug || !(k in debug)) patch[k] = resolved[k];
    }
    if (Object.keys(patch).length) push(patch);
  }, [resolved, debug, push]);

  // The sun vector is a readout of what actually reached the light, which is
  // the thing to check when shadows look like they disagree with the sky.
  useEffect(() => {
    if (resolved) push({ "sun vector": fmtVec(resolved.sunDirection) });
  }, [resolved, push]);

  return null;
}

/** Sun direction as a readable triple — the number to compare against the sky
 *  when the shadows look like they are coming from the wrong side. */
function fmtVec(v: readonly number[]) {
  return v.map((n) => n.toFixed(2)).join(", ");
}
