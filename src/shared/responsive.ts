"use client";

import { useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT_PX = 1024;

/** Media query string for "mobile". Use with `matchMedia` or in JSX. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

export const SHORT_BREAKPOINT_PX = 540;
export const SHORT_MEDIA_QUERY = `(max-height: ${SHORT_BREAKPOINT_PX}px)`;

export const PORTRAIT_MEDIA_QUERY = "(orientation: portrait)";

/** Narrow OR short. A phone on its side is 844px wide and fails every
 *  width test, so anything asking "is this a hand-held screen" has to ask
 *  both ways. */
export const HANDHELD_MEDIA_QUERY = `(max-width: 639px), ${SHORT_MEDIA_QUERY}`;

export const COARSE_POINTER_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

export function useMediaQuery(query: string): boolean {
  const [subscribe, getSnapshot] = store(query);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Reactive hook: `true` when the viewport is short (landscape phone). */
export function useShortViewport(): boolean {
  return useMediaQuery(SHORT_MEDIA_QUERY);
}

/** Reactive hook: `true` when the viewport is below `MOBILE_BREAKPOINT_PX`. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}

/** Reactive hook: `true` on a phone in either grip. See HANDHELD_MEDIA_QUERY. */
export function useIsHandheld(): boolean {
  return useMediaQuery(HANDHELD_MEDIA_QUERY);
}

/** Reactive hook: `true` when the viewport is taller than it is wide. See the
 *  query above for why it is asked this way round. */
export function usePortrait(): boolean {
  return useMediaQuery(PORTRAIT_MEDIA_QUERY);
}

/** Reactive hook: `true` on a touch-primary device (phone/tablet). Use for
 *  hit-target sizing; use `useIsMobile()` for layout. */
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
