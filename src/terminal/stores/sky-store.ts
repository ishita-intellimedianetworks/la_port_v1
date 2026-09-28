import type { Site } from "@/config";
import { createSeededStore } from "@/shared/stores/create-store";
import {
  T_FOR_MODE,
  sunAnglesForT,
  type SkyMode,
} from "../scene/environment/sky/palette";

export type SkyState = {
  mode: SkyMode;
  t: number;
  tSeed: number;
  clouds: boolean;
  sunUnlinked: boolean;
  sunAzimuth: number;
  sunElevation: number;
  setT: (t: number) => void;
  setClouds: (clouds: boolean) => void;
  setSunUnlinked: (value: boolean) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  matchSunToSky: () => void;
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

function anglesFor(t: number) {
  const { azimuth, elevation } = sunAnglesForT(t);
  return { sunAzimuth: azimuth, sunElevation: elevation };
}
