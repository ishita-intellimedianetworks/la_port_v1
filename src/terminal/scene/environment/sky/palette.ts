import * as THREE from "three";

/**
 * Time-of-day palette, ported from the `open-sea` shader study.
 *
 * There, one `skyColor()` function fed BOTH the dome and the water's
 * reflection, and a single `applyTimeOfDay(t)` drove every colour uniform from
 * one scalar. Only the sky half is ported here (there is no ocean), but the
 * numbers are the study's verbatim — same stops, same blend, same sun arc — so
 * the gradient reads identically.
 *
 * All values are LINEAR working-space RGB (what `Color.setRGB` takes by
 * default), matching the study, which ran them straight into shader uniforms.
 */

export type SkyMode = "day" | "afternoon" | "dusk" | "off";

type Stops = {
  zenith: [number, number, number];
  horizon: [number, number, number];
  sun: [number, number, number];
  /** Multiplier on `sun` before it reaches the shader — dusk runs hotter so the
   *  low sun still burns through a dark sky. */
  intensity: number;
  /** The study's OCEAN deep-water colour. Kept only because the below-horizon
   *  haze it built from it (`deep*1.4 + horizon*0.25`) is what stops downward
   *  rays going black; dropping it would change the horizon band. */
  deep: [number, number, number];
};

const DAY: Stops = {
  zenith: [0.07, 0.2, 0.42],
  horizon: [0.52, 0.68, 0.82],
  sun: [1.0, 0.93, 0.8],
  intensity: 1.6,
  deep: [0.015, 0.09, 0.11],
};

const DUSK: Stops = {
  zenith: [0.03, 0.05, 0.16],
  horizon: [0.85, 0.36, 0.16],
  sun: [1.0, 0.42, 0.14],
  intensity: 2.6,
  deep: [0.02, 0.045, 0.075],
};

/**
 * The `t` each mode parks on, using the study's own bands (`t < 0.12` Dusk,
 * `< 0.3` Golden Hour, `< 0.62` Afternoon, else Midday).
 *
 *   dusk      0.06 — the sun a hair UNDER the horizon, where the daylight blend
 *                    is exactly 0 and the palette is pure DUSK.
 *   afternoon 0.55 — 18° up. High enough that the terminal is lit rather than
 *                    raked, still low enough to keep warmth in the light and
 *                    length in the shadows. The default.
 *   day       0.80 — a flat, high midday sun.
 */
export const T_FOR_MODE: Record<Exclude<SkyMode, "off">, number> = {
  dusk: 0.06,
  afternoon: 0.55,
  day: 0.8,
};

/** The sun's arc across `t`, in radians — the study's numbers. */
const ELEVATION = [-0.05, 0.62] as const;
const AZIMUTH = [-0.9, 0.9] as const;

/** Sun elevation above the horizon in degrees — the readout that tells you why
 *  a palette looks the way it does, since the DUSK → DAY blend keys off this
 *  and not off `t`. Negative means the sun has set. */
export function sunElevationDeg(t: number): number {
  return (sunElevation(t) * 180) / Math.PI;
}

/** The study's own names for the arc, used by the debug slider's readout. */
export function labelForT(t: number): string {
  if (t < 0.12) return "Dusk";
  if (t < 0.3) return "Golden Hour";
  if (t < 0.62) return "Afternoon";
  return "Midday";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const sunElevation = (t: number) => lerp(ELEVATION[0], ELEVATION[1], t);

const mixRGB = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

const smoothstepJS = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

const color = (rgb: [number, number, number]) =>
  new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);

export type SkySample = {
  /** Normalised sun direction in world space (Y up, −Z forward). */
  sunDir: THREE.Vector3;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Sun colour ALREADY multiplied by the palette intensity — the shader wants
   *  the emissive value, not a base tint. */
  sun: THREE.Color;
  /** The same colour UNMULTIPLIED. This is the sun's actual tint, and so what
   *  a scene light should be coloured with (three keeps intensity separate). */
  sunBase: THREE.Color;
  /** Below-horizon haze, so rays under the horizon never reach black. */
  haze: THREE.Color;
};

/**
 * Resolve one point on the day arc. Verbatim port of the study's
 * `applyTimeOfDay`: the sun sweeps elevation −0.05 → 0.62 rad and azimuth
 * −0.9 → 0.9 rad across `t`, and the palette crossfades DUSK → DAY on a
 * smoothstep of the sun's ELEVATION (not of `t`), so the colour change tracks
 * the sun clearing the horizon rather than the slider position.
 */
export function sampleSky(t: number): SkySample {
  const elevation = sunElevation(t);
  const azimuth = lerp(AZIMUTH[0], AZIMUTH[1], t);
  const ce = Math.cos(elevation);
  const sunDir = new THREE.Vector3(
    ce * Math.sin(azimuth),
    Math.sin(elevation),
    -ce * Math.cos(azimuth),
  ).normalize();

  const w = smoothstepJS(0.0, 0.42, elevation);
  const zenith = mixRGB(DUSK.zenith, DAY.zenith, w);
  const horizon = mixRGB(DUSK.horizon, DAY.horizon, w);
  const deep = mixRGB(DUSK.deep, DAY.deep, w);
  const sunBase = mixRGB(DUSK.sun, DAY.sun, w);
  const intensity = lerp(DUSK.intensity, DAY.intensity, w);

  return {
    sunDir,
    zenith: color(zenith),
    horizon: color(horizon),
    sun: color([
      sunBase[0] * intensity,
      sunBase[1] * intensity,
      sunBase[2] * intensity,
    ]),
    sunBase: color(sunBase),
    // haze = deep*1.4 + horizon*0.25, as the study built it.
    haze: color([
      deep[0] * 1.4 + horizon[0] * 0.25,
      deep[1] * 1.4 + horizon[1] * 0.25,
      deep[2] * 1.4 + horizon[2] * 0.25,
    ]),
  };
}

// ── Scene lighting, derived from the same palette ────────────────────────────

/**
 * Floor on the sun LIGHT's elevation, in radians. 0.26 ≈ 15°.
 *
 * At dusk the sun sits a hair BELOW the horizon — correct for the sky, useless
 * for the light, which would then light the model from underneath. But the
 * bigger problem is shadow acne: a shadow map's depth error goes as
 * `1/tan(elevation)`, so light arriving at 7° slopes ~10.5 m of depth across a
 * texel of this map, and no `shadowBias` small enough to keep shadows attached
 * can cover that. Lifting to 15° roughly HALVES the slope — it is the cheapest
 * fix because it targets the cause, and covering the same error with bias
 * instead would need about -0.006, which detaches every shadow in the scene
 * from the thing casting it.
 *
 * The look survives: this lifts only the light. The sky's own sun is drawn from
 * the unmodified `sampleSky`, so the sunset stays exactly where it is on the
 * horizon — the sun you SEE and the sun that SHADES simply stop being the same
 * ray below 15°.
 */
const LIGHT_MIN_ELEVATION = 0.26;

/**
 * Where the ambient term samples the dome: 45° up, through the study's own
 * `pow(up, 0.42)` gradient curve. Ambient stands in for the whole sky lighting
 * the model, and mid-sky is what that mostly is — sampling AT the horizon would
 * make the ambient as orange as the sunset and flatten the scene, and sampling
 * at the zenith would ignore the half of the dome nearest the ground.
 */
const AMBIENT_UP = Math.pow(Math.SQRT1_2, 0.42);

const hex = (c: THREE.Color) => `#${c.getHexString(THREE.SRGBColorSpace)}`;

export type SkyLighting = {
  sunDirection: [number, number, number];
  /** The palette's sun tint. */
  sunColor: string;
  /** The sky's own colour at mid-elevation. */
  ambientColor: string;
  /** Sky fill from above — the same mid-sky colour. */
  hemiSkyColor: string;
  /** Ground bounce from below: the study's below-horizon haze, which is the
   *  colour its own downward rays returned. */
  hemiGroundColor: string;
};

/**
 * The scene lights this sky implies, so the model is lit BY the sky rather than
 * beside it. Direction, sun tint and ambient tint all come from the palette
 * above — none of them is authored, because a hand-picked hex next to a
 * generated sky is exactly the pair that drifts apart. Intensities are not
 * derived: the study is a shader with no scene lights, so it has no opinion on
 * them, and they stay authorable in `site.json › sky.lights`.
 */
export function lightingForT(t: number): SkyLighting {
  const s = sampleSky(t);

  const dir = s.sunDir;
  if (dir.y < LIGHT_MIN_ELEVATION) {
    dir.y = LIGHT_MIN_ELEVATION;
    dir.normalize();
  }

  const midSky = hex(s.horizon.clone().lerp(s.zenith, AMBIENT_UP));

  return {
    sunDirection: [dir.x, dir.y, dir.z],
    sunColor: hex(s.sunBase),
    ambientColor: midSky,
    hemiSkyColor: midSky,
    hemiGroundColor: hex(s.haze),
  };
}
