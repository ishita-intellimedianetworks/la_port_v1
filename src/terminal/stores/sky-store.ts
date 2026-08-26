import { scene } from "@/config";
import { createStore } from "@/shared/stores/create-store";
import { T_FOR_MODE, type SkyMode } from "../scene/environment/sky/palette";

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
  setT: (t: number) => void;
  setClouds: (clouds: boolean) => void;
  /** Back to whatever `site.json` authored. */
  reset: () => void;
};

export const useSkyStore = createStore<SkyState>((set) => ({
  t: SKY_T_SEED,
  clouds: scene.sky?.clouds !== false,
  setT: (t) => set({ t: Math.min(Math.max(t, 0), 1) }),
  setClouds: (clouds) => set({ clouds }),
  reset: () => set({ t: SKY_T_SEED, clouds: scene.sky?.clouds !== false }),
}));
