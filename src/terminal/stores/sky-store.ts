import { scene } from "@/config";
import { createStore } from "@/shared/stores/create-store";
import {
  T_FOR_MODE,
  sunAnglesForT,
  type SkyMode,
} from "../scene/environment/sky/palette";

/**
 * The live sky, so the debug panel and the dome are looking at ONE value.
 *
 * `site.json › sky` is the seed, not the truth: the whole point of the debug
 * time-of-day slider is to move the sun without an edit-reload cycle, and the
 * study it is ported from worked the same way — one scalar `t`, driven from a
 * slider, with every colour derived from it and nothing ever rebuilt.
 *
 * Read `t` and `clouds` from here rather than from config, and the panel drives
 * them for free. Nothing writes to this store unless the panel is open.
 */

const CONFIG_MODE: SkyMode = scene.sky?.mode ?? "off";

/** The sky the config asked for. `off` disables the dome entirely. */
export const SKY_MODE: SkyMode = CONFIG_MODE;

/** Where the slider starts: an explicit `sky.t`, else the mode's own stop. */
export const SKY_T_SEED =
  CONFIG_MODE === "off" ? 0 : scene.sky?.t ?? T_FOR_MODE[CONFIG_MODE];

export type SkyState = {
  /** Time of day, 0..1 — 0 is the sun on the horizon, 1 is high midday. */
  t: number;
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
   *  `site.json > sky.sun`. */
  setSunUnlinked: (value: boolean) => void;
  setSunAzimuth: (deg: number) => void;
  setSunElevation: (deg: number) => void;
  /** Put the unlinked angles back on the arc for the current `t` — the way out
   *  of a set of angles that has drifted somewhere unreadable, without having
   *  to give up the unlink. */
  matchSunToSky: () => void;
  /** Back to whatever `site.json` authored. */
  reset: () => void;
};

/** What the page LOADS with: `site.json › sky.sun` when it is authored, else
 *  the sun on the arc. The angles still carry a value in the linked case, but
 *  it is never seen — the panel reseeds them from `t` the moment unlink is
 *  switched on. */
const SUN = scene.sky?.sun;

export const SUN_SEED = {
  sunUnlinked: !!SUN,
  sunAzimuth: SUN?.azimuth ?? 0,
  sunElevation: SUN?.elevation ?? 45,
};

export const useSkyStore = createStore<SkyState>((set, get) => ({
  t: SKY_T_SEED,
  clouds: scene.sky?.clouds !== false,
  ...SUN_SEED,
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
  reset: () =>
    set({ t: SKY_T_SEED, clouds: scene.sky?.clouds !== false, ...SUN_SEED }),
}));

/** The arc's angles for `t`, named the way the store stores them. */
function anglesFor(t: number) {
  const { azimuth, elevation } = sunAnglesForT(t);
  return { sunAzimuth: azimuth, sunElevation: elevation };
}
