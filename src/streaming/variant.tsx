"use client";

import { useMemo } from "react";
import { useSiteId } from "@/config/context";
import { STREAM_VARIANTS, type StreamVariant, type StreamVariantId } from "./config";

export function useStreamVariantId(): StreamVariantId {
  return useSiteId();
}

export function useStreamVariant(): StreamVariant {
  const id = useSiteId();
  return useMemo(() => STREAM_VARIANTS[id], [id]);
}
