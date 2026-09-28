"use client";

import { useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT_PX = 1024;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

export const SHORT_BREAKPOINT_PX = 540;
export const SHORT_MEDIA_QUERY = `(max-height: ${SHORT_BREAKPOINT_PX}px)`;

export const PORTRAIT_MEDIA_QUERY = "(orientation: portrait)";

export const HANDHELD_MEDIA_QUERY = `(max-width: 639px), ${SHORT_MEDIA_QUERY}`;

export const COARSE_POINTER_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = store(query);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useShortViewport(): boolean {
  return useMediaQuery(SHORT_MEDIA_QUERY);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}

export function useIsHandheld(): boolean {
  return useMediaQuery(HANDHELD_MEDIA_QUERY);
}

export function usePortrait(): boolean {
  return useMediaQuery(PORTRAIT_MEDIA_QUERY);
}

export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_MEDIA_QUERY);
}

const stores = new Map<string, [(cb: () => void) => () => void, () => boolean]>();

function store(query: string): [(cb: () => void) => () => void, () => boolean] {
  const hit = stores.get(query);
  if (hit) return hit;
  let mql: MediaQueryList | null = null;
  const list = () => {
    if (typeof window === "undefined") return null;
    if (!mql) mql = window.matchMedia(query);
    return mql;
  };
  const made: [(cb: () => void) => () => void, () => boolean] = [
    (onChange) => {
      const mq = list();
      if (!mq) return () => {};
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => list()?.matches ?? false,
  ];
  stores.set(query, made);
  return made;
}

function getServerSnapshot(): boolean {
  return false;
}
