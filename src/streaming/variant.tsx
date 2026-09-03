"use client";

/**
 * Which BAKE this tree streams — read off the SITE the tree was mounted with.
 *
 * There is no second context here any more. A model is one choice: `/` runs
 * `config/sites/v1.json` and streams the bake its `stream` block names, `/v2`
 * runs `v2.json`, `/v3` runs `v3.json`. Keeping a stream-variant id that could
 * differ from the site id would just be a way for a route to walk one bake's
 * navmesh while reading another's cameras.
 *
 * So `<SiteProvider id>` (config/context.tsx) is the one provider, and these
 * two hooks are the streaming-side view of it.
 */

import { useMemo } from "react";
import { useSiteId } from "@/config/context";
import { STREAM_VARIANTS, type StreamVariant, type StreamVariantId } from "./config";

/** The id alone — for the handful of places that only need to branch. */
export function useStreamVariantId(): StreamVariantId {
  return useSiteId();
}

/** The resolved variant: asset base, navmesh url, and the three strategies over
 *  its manifest. Referentially stable per id, so it is safe in a dep array. */
export function useStreamVariant(): StreamVariant {
  const id = useSiteId();
  return useMemo(() => STREAM_VARIANTS[id], [id]);
}
