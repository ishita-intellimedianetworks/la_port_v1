"use client";

/**
 * Which BAKE this tree streams.
 *
 * Three, served side by side so they can be compared in the same browser on the
 * same machine: `/` streams `site.json > stream`, `/v2` streams `streamV2`
 * merged over it, and `/v3` streams `streamV3` — falling back to v2's resolved
 * bake while that block is unauthored, because `/v3` is a fork of `/v2` and
 * starts identical to it. Everything else about the routes — the cameras, the
 * hotspots, the map, the layouts — is the same zone and the same data.
 *
 * The id is about the BAKE, not the code. `/` and `/v2` share one component
 * tree (`@/terminal`) and differ only by this value; `/v3` has its own fork
 * (`@/terminal-v3`) so its rendering can change without touching theirs.
 *
 * WHY A CONTEXT AND NOT A MODULE-LEVEL SWITCH. The resolved configs used to be
 * module-level constants over the single `stream` block, which is precisely
 * what made a second bake impossible: the asset base in particular was a
 * `const` derived from an env var, so the whole app could only ever point at
 * one prefix. Passing the id down means both variants are ordinary values, two
 * routes can be open at once, and nothing has to be mutated at import time.
 *
 * Defaulting to `v1` is deliberate: a tree that forgets to declare itself gets
 * the frozen, known-good route rather than the experimental one.
 */

import { createContext, useContext, useMemo } from "react";
import { STREAM_VARIANTS, type StreamVariant, type StreamVariantId } from "./config";

const Ctx = createContext<StreamVariantId>("v1");

export function StreamVariantProvider({
  id,
  children,
}: {
  id: StreamVariantId;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

/** The id alone — for the handful of places that only need to branch. */
export function useStreamVariantId(): StreamVariantId {
  return useContext(Ctx);
}

/** The resolved variant: asset base, navmesh url, and the three strategies over
 *  its manifest. Referentially stable per id, so it is safe in a dep array. */
export function useStreamVariant(): StreamVariant {
  const id = useContext(Ctx);
  return useMemo(() => STREAM_VARIANTS[id], [id]);
}
