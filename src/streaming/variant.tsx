"use client";

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
