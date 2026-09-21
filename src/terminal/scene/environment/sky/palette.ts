import * as THREE from "three";

export type SkyMode = "day" | "afternoon" | "dusk" | "off";

type Stops = {
  zenith: [number, number, number];
  horizon: [number, number, number];
  sun: [number, number, number];
  /** Multiplier on `sun` before it reaches the shader — dusk runs hotter so the
   *  low sun still burns through a dark sky. */
  intensity: number;
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

export const T_FOR_MODE: Record<Exclude<SkyMode, "off">, number> = {
  dusk: 0.06,
  afternoon: 0.55,
  day: 0.8,
};

/** The sun's arc across `t`, in radians — the study's numbers. */
const ELEVATION = [-0.05, 0.62] as const;
const AZIMUTH = [-0.9, 0.9] as const;

export type SunAim = {
  /** Compass angle, radians. 0 puts the sun toward −Z; positive swings to +X. */
  azimuth: number;
  elevation: number;
};

/** Highest the sun may be placed — straight overhead casts shadows directly
 *  under everything, which reads as no shadows at all. */
const SUN_MAX_ELEVATION = Math.PI / 2 - 0.05;

export function sunElevationDeg(t: number): number {
  return (sunElevation(t) * 180) / Math.PI;
}

export function sunAnglesForT(t: number): { azimuth: number; elevation: number } {
  const a = sunAngles(t);
  const deg = 180 / Math.PI;
  return { azimuth: a.azimuth * deg, elevation: a.elevation * deg };
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
const sunAzimuth = (t: number) => lerp(AZIMUTH[0], AZIMUTH[1], t);

function sunAngles(t: number, aim?: SunAim | null) {
  return {
    elevation: Math.min(
      Math.max(aim ? aim.elevation : sunElevation(t), SUN_MIN_ELEVATION),
      SUN_MAX_ELEVATION,
    ),
    azimuth: aim ? aim.azimuth : sunAzimuth(t),
  };
}

/** The study's world-space sun ray for a given elevation/azimuth (Y up, −Z
 *  forward). Split out so `sunAngles` has one place to turn into a vector. */
function sunRay(elevation: number, azimuth: number): THREE.Vector3 {
  const ce = Math.cos(elevation);
  return new THREE.Vector3(
    ce * Math.sin(azimuth),
    Math.sin(elevation),
    -ce * Math.cos(azimuth),
  ).normalize();
}

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

export function sampleSky(t: number, aim?: SunAim | null): SkySample {
  const elevation = sunElevation(t);
  const a = sunAngles(t, aim);
  const sunDir = sunRay(a.elevation, a.azimuth);

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
    haze: color([
      deep[0] * 1.4 + horizon[0] * 0.25,
      deep[1] * 1.4 + horizon[1] * 0.25,
      deep[2] * 1.4 + horizon[2] * 0.25,
    ]),
  };
}

const SUN_MIN_ELEVATION = 0.26;

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

export function lightingForT(t: number, aim?: SunAim | null): SkyLighting {
  const s = sampleSky(t);

  const a = sunAngles(t, aim);
  const dir = sunRay(a.elevation, a.azimuth);

  const midSky = hex(s.horizon.clone().lerp(s.zenith, AMBIENT_UP));

  return {
    sunDirection: [dir.x, dir.y, dir.z],
    sunColor: hex(s.sunBase),
    ambientColor: midSky,
    hemiSkyColor: midSky,
    hemiGroundColor: hex(s.haze),
  };
}
