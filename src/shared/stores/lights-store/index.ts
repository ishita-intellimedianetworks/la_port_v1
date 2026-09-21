import type { ResolvedLights } from "@/shared/types";
import { createStore } from "../create-store";

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

  debug: Partial<ResolvedLights> | null;

  debugShadows: boolean | null;

  resolved: ResolvedLights | null;
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
