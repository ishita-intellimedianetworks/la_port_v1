"use client";

/**
 * WHICH MODEL this tree is running — the one id every per-model lookup hangs
 * off, and the only thing the three routes disagree about at the top.
 *
 * `sites/v1.json`, `v2.json` and `v3.json` are three complete, independent
 * documents (see `./index`), so "the config" is not a module constant any more:
 * it is whichever of the three this subtree was mounted with. A route names it
 * once —
 *
 *     <SiteProvider id="v2"> … </SiteProvider>
 *
 * — and everything below reads `useSite()`.
 *
 * WHY A CONTEXT AND NOT A MODULE-LEVEL SWITCH. Module-level constants over one
 * document are exactly what made a second model impossible: the asset base was
 * a `const` derived from an env var, so the whole app could only ever point at
 * one prefix, and every camera, hotspot and sky value was shared whether that
 * was wanted or not. Passing the id down means all three sites are ordinary
 * values, two routes can be open in adjacent tabs, and nothing is mutated at
 * import time.
 *
 * Defaulting to `v1` is deliberate: a tree that forgets to declare itself gets
 * the frozen, known-good model rather than an experimental one.
 */

import { createContext, useContext, useMemo } from "react";
import { getSite, type Site, type SiteId } from "./index";

const Ctx = createContext<SiteId>("v1");

export function SiteProvider({ id, children }: { id: SiteId; children: React.ReactNode }) {
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

/** The id alone — for the handful of places that only need to branch. */
export function useSiteId(): SiteId {
  return useContext(Ctx);
}

/** The resolved site: `scene`, `ui`, the two tables, the id lookups and the
 *  pose helpers. Referentially stable per id, so it is safe in a dep array. */
export function useSite(): Site {
  const id = useContext(Ctx);
  return useMemo(() => getSite(id), [id]);
}
