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

  /**
   * The `?debug=true` panel's edits — the LAST word on every field it names.
   *
   * It has to sit above `override` and above the sky's own `envOverride`, and
   * that ordering is the whole reason it is a separate layer rather than writes
   * into `values`: `values` is merged UNDER the sky, so a hand-set
   * `sunIntensity` there is silently replaced by `site.json › sky.lights` on
   * the very next render, and the panel would appear not to work.
   *
   * Sparse on purpose. Only the fields actually touched are present, so
   * everything else keeps flowing from the config and the sky — move the
   * time-of-day slider after setting `sunIntensity` and the tint still
   * follows the palette while the intensity stays put.
   */
  debug: Partial<ResolvedLights> | null;

  /** The panel's shadow toggle, or null while it has not touched it. Separate
   *  from `shadows` for the same reason `debug` is separate from `values`:
   *  `shadows` is only consulted when the venue opted into `lights.controls`,
   *  and the debug panel has to work on every venue. */
  debugShadows: boolean | null;

  /**
   * What SceneLights ACTUALLY rendered last, every layer resolved.
   *
   * The panel is downstream of a merge it does not perform (defaults → venue →
   * sky → override → debug), so without this it could only show the sparse
   * values it set itself and would have nothing to put in the JSON for the
   * rest. SceneLights publishes here; the panel reads. Null until first render.
   */
  resolved: ResolvedLights | null;
  /** Whether the sun is actually CASTING, alongside `resolved`. Not part of
   *  `ResolvedLights` (it is a scene-level prop, not a light value), and the
   *  panel cannot infer it: `shadows` is false on floors like the stadium, so
   *  defaulting the checkbox to on would mislabel them. */
  resolvedShadows: boolean;

  /** (Re)seed for a venue. Seeding the same venue again only updates `enabled`,
   *  so live edits survive unrelated re-renders. */
  seed: (key: string, values: ResolvedLights, enabled: boolean, shadows: boolean) => void;
  setField: <K extends keyof ResolvedLights>(key: K, value: ResolvedLights[K]) => void;
  setShadows: (value: boolean) => void;
  setOverride: (override: Partial<ResolvedLights> | null) => void;
  setCloudsHidden: (value: boolean) => void;

  /** Pin one field to `value` from the debug panel. */
  setDebugField: <K extends keyof ResolvedLights>(key: K, value: ResolvedLights[K]) => void;
  setDebugShadows: (value: boolean | null) => void;
  /** Unpin everything — the scene falls straight back to config + sky. */
  clearDebug: () => void;
  /** Called by SceneLights with the fully-merged set it just rendered. */
  publishResolved: (values: ResolvedLights, shadows: boolean) => void;
};

/** True when `a` and `b` have the same keys with the same values, one level
 *  deep. `publishResolved` runs on every re-render of SceneLights and would
 *  otherwise write a new object each time — which re-renders the panel, which
 *  is subscribed to it. This is what makes that loop terminate. */
function sameValues(a: ResolvedLights | null, b: ResolvedLights) {
  if (!a) return false;
  const ak = Object.keys(a) as (keyof ResolvedLights)[];
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => {
    const av = a[k];
    const bv = b[k];
    // `sunDirection` is the one array field; compare it by content, since it is
    // rebuilt every time the sky resolves and never by identity.
    if (Array.isArray(av) && Array.isArray(bv)) {
      return av.length === bv.length && av.every((n, i) => Object.is(n, bv[i]));
    }
    return Object.is(av, bv);
  });
}

export const useLightsStore = createStore<LightsState>((set, get) => ({
  enabled: false,
  values: null,
  shadows: true,
  seedKey: null,
  override: null,
  cloudsHidden: false,
  debug: null,
  debugShadows: null,
  resolved: null,
  resolvedShadows: true,

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

  setDebugField: (key, value) => {
    const { debug } = get();
    if (debug && Object.is(debug[key], value)) return;
    set({ debug: { ...debug, [key]: value } });
  },
  setDebugShadows: (debugShadows) => set({ debugShadows }),
  clearDebug: () => set({ debug: null, debugShadows: null }),
  publishResolved: (values, shadows) => {
    const cur = get();
    if (cur.resolvedShadows === shadows && sameValues(cur.resolved, values)) return;
    set({ resolved: values, resolvedShadows: shadows });
  },
}));
