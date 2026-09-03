import type { Site } from "@/config";
import { createSeededStore } from "@/shared/stores/create-store";
import {
  T_FOR_MODE,
  sunAnglesForT,
  type SkyMode,
} from "../scene/environment/sky/palette";

/**
 * The live sky, so the debug panel and the dome are looking at ONE value.
 *
 * The active model's `sky` block is the seed, not the truth: the whole point of
 * the debug time-of-day slider is to move the sun without an edit-reload cycle,
 * and the study it is ported from worked the same way — one scalar `t`, driven
 * from a slider, with every colour derived from it and nothing ever rebuilt.
 *
 * Read `t` and `clouds` from here rather than from config, and the panel drives
 * them for free. Nothing writes to this store unless the panel is open.
 *
 * `mode` and the seeds live IN the store rather than beside it as module
 * constants, because the sky is per model now: `/` and `/v2` share this tree
 * but not their site files, so a constant read at import could only ever be one
 * of them. The tree's root seeds it — see `createSeededStore`.
 */

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
  /** Take the sun off the day arc. While true it is placed by `sunAzimuth` /
   *  `sunElevation` alone and `t` no longer moves it — for the disk drawn in
   *  the dome and for the shadow-casting light alike, which read one answer and
   *  so stay the same ray. Every COLOUR still comes from `t`. See `SunAim`. */
  sunUnlinked: boolean;
  /** Compass angle of the sun, DEGREES. 0 puts it toward −Z, positive swings
   *  toward +X. Only read while `sunUnlinked`. */
  sunAzimuth: number;
  /** Height of the sun above the horizon, DEGREES. Clamped to 15°..85° by the
   *  palette. Only read while `sunUnlinked`. */
  sunElevation: number;
  setT: (t: number) => void;
  setClouds: (clouds: boolean) => void;
  /** Unlinking SEEDS the angles from wherever `t` currently has the sun, so
   *  flipping it on never makes anything jump — it just stops the sun tracking
   *  the time of day. Re-linking leaves the angles alone; they are only ignored.
   *
   *  Only a real TRANSITION seeds. Setting it to the value it already holds is
   *  a no-op, because the seed would otherwise discard angles that came from
   *  the site file's `sky.sun`. */
  setSunUnlinked: (value: boolean) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  /** Put the unlinked angles back on the arc for the current `t` — the way out
   *  of a set of angles that has drifted somewhere unreadable, without having
   *  to give up the unlink. */
  matchSunToSky: () => void;
  /** Back to whatever this model's file authored. */
  reset: () => void;
};

export const useSkyStore = createSeededStore<SkyState, Site>("sky-store", (site) => {
  const sky = site.scene.sky;
  const mode: SkyMode = sky?.mode ?? "off";
  const tSeed = mode === "off" ? 0 : sky?.t ?? T_FOR_MODE[mode];
  const clouds = sky?.clouds !== false;

  /** What the page LOADS with: `sky.sun` when it is authored, else the sun on
   *  the arc. The angles still carry a value in the linked case, but it is
   *  never seen — the panel reseeds them from `t` the moment unlink is switched
   *  on. */
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
      // A no-op transition must stay a no-op. Re-seeding on every call looks
      // harmless until something asks for the state it is already in — a panel
      // firing `onChange` once on mount with the value it was seeded with is
      // exactly that — and the re-seed then throws away the authored angles and
      // replaces them with the arc's. With `sky.sun` in config the checkbox
      // starts checked, so this fired on every page load and reset the azimuth to
      // whatever `t` implied before anyone had touched anything.
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
