import type { Site } from "@/config";
import { createSeededStore } from "@/shared/stores/create-store";
import {
  T_FOR_MODE,
  sunAnglesForT,
  type SkyMode,
} from "../scene/environment/sky/palette";

export type SkyState = {
  /** The sky this model asked for. `off` disables the dome entirely. */
  mode: SkyMode;
  /** Time of day, 0..1 — 0 is the sun on the horizon, 1 is high midday. */
  t: number;
  /** Where the slider starts: an explicit `sky.t`, else the mode's own stop. */
  tSeed: number;
  /** The horizon cloud band. Toggling it recompiles the sky shader (it is a
   *  `#define`), which is why it is a debug control and not a per-frame one. */
  clouds: boolean;
  sunUnlinked: boolean;
  /** Compass angle of the sun, DEGREES. 0 puts it toward −Z, positive swings
   *  toward +X. Only read while `sunUnlinked`. */
  sunAzimuth: number;
  /** Height of the sun above the horizon, DEGREES. Clamped to 15°..85° by the
   *  palette. Only read while `sunUnlinked`. */
  sunElevation: number;
  setT: (t: number) => void;
  setClouds: (clouds: boolean) => void;
  setSunUnlinked: (value: boolean) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  matchSunToSky: () => void;
  /** Back to whatever this model's file authored. */
  reset: () => void;
};

export const useSkyStore = createSeededStore<SkyState, Site>("sky-store", (site) => {
  const sky = site.scene.sky;
  const mode: SkyMode = sky?.mode ?? "off";
  const tSeed = mode === "off" ? 0 : sky?.t ?? T_FOR_MODE[mode];
  const clouds = sky?.clouds !== false;

  const sun = sky?.sun;
  const sunSeed = {
    sunUnlinked: !!sun,
    sunAzimuth: sun?.azimuth ?? 0,
    sunElevation: sun?.elevation ?? 45,
  };

  return (set, get) => ({
    mode,
    t: tSeed,
    tSeed,
    clouds,
    ...sunSeed,
    setT: (t) => set({ t: Math.min(Math.max(t, 0), 1) }),
    setClouds: (clouds) => set({ clouds }),
    setSunUnlinked: (sunUnlinked) => {
      if (get().sunUnlinked === sunUnlinked) return;
      set(sunUnlinked ? { sunUnlinked, ...anglesFor(get().t) } : { sunUnlinked });
    },
    setSunAzimuth: (deg) => set({ sunAzimuth: deg }),
    setSunElevation: (deg) => set({ sunElevation: deg }),
    matchSunToSky: () => set(anglesFor(get().t)),
    reset: () => set({ t: tSeed, clouds, ...sunSeed }),
  });
});

/** The arc's angles for `t`, named the way the store stores them. */
function anglesFor(t: number) {
  const { azimuth, elevation } = sunAnglesForT(t);
  return { sunAzimuth: azimuth, sunElevation: elevation };
}
