import type { ResolvedLights } from "@/shared/types";
import { createStore } from "../create-store";

/**
 * Bridges the in-canvas lights with any out-of-canvas lighting controls.
 *
 * A venue that asks for live controls seeds this store with its resolved
 * values; the scene then renders from `values` instead of the static config.
 * Seeding is keyed on the venue so switching venues reloads that venue's values
 * and never clobbers another's live edits.
 */
export type LightsState = {
  /** True when the active venue requested live controls. */
  enabled: boolean;
  /** The live, editable values. Null until a venue seeds them. */
  values: ResolvedLights | null;
  /** Live shadow toggle — scene-level, so not part of `values`. */
  shadows: boolean;
  /** Which venue the current `values` came from. */
  seedKey: string | null;
  /** Fields merged OVER whatever would otherwise render, for environment
   *  modes (dusk / night). Null leaves rendering untouched. */
  override: Partial<ResolvedLights> | null;
  /** Environment modes hide the drifting cloud layer, which reads as daytime. */
  cloudsHidden: boolean;

  /** (Re)seed for a venue. Seeding the same venue again only updates `enabled`,
   *  so live edits survive unrelated re-renders. */
  seed: (key: string, values: ResolvedLights, enabled: boolean, shadows: boolean) => void;
  setField: <K extends keyof ResolvedLights>(key: K, value: ResolvedLights[K]) => void;
  setShadows: (value: boolean) => void;
  setOverride: (override: Partial<ResolvedLights> | null) => void;
  setCloudsHidden: (value: boolean) => void;
};

export const useLightsStore = createStore<LightsState>((set, get) => ({
  enabled: false,
  values: null,
  shadows: true,
  seedKey: null,
  override: null,
  cloudsHidden: false,

  seed: (key, values, enabled, shadows) =>
    set(get().seedKey === key ? { enabled } : { seedKey: key, values, enabled, shadows }),

  setField: (key, value) => {
    const { values } = get();
    if (!values || Object.is(values[key], value)) return;
    set({ values: { ...values, [key]: value } });
  },

  setShadows: (value) => set({ shadows: value }),
  setOverride: (override) => set({ override }),
  setCloudsHidden: (value) => set({ cloudsHidden: value }),
}));
