/**
 * Single source of truth for the mobile / desktop boundary used in JS code.
 *
 * Matches:
 *   • Tailwind's `lg:` breakpoint (≥ 1024 px = desktop styling)
 *   • The `@media (max-width: 1023px)` block in `globals.css` that scales the
 *     glass blur radius down on small screens
 *
 * Anywhere code needs to ask "is this phone-sized?" should import from here —
 * do NOT hand-roll `window.innerWidth < 768` or `matchMedia("(max-width:
 * 767px)")` calls. Inconsistent thresholds make the UI flip styles at
 * different sizes depending on which component you look at.
 *
 * `isLowPower()` in `shared/helpers/index.ts` is intentionally separate — it's
 * a device-capability heuristic (used to throttle materials / postFX), not a
 * layout breakpoint, so it can keep its own threshold.
 */
"use client";

import { useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT_PX = 1024;

/** Media query string for "mobile". Use with `matchMedia` or in JSX. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

// Height breakpoint — mirrors the CSS `short:` custom variant
// (`@media (max-height: 540px)` in globals.css), i.e. a landscape phone. Use the
// hook below when JS needs to size things (canvas px, flap geometry) the same
// way the `short:` Tailwind classes restyle the rest of the UI.
export const SHORT_MEDIA_QUERY = `(max-height: 540px)`;

/** Reactive hook: `true` when the viewport is short (landscape phone). */
export function useShortViewport(): boolean {
  return useSyncExternalStore(subscribeShort, getShortSnapshot, getServerSnapshot);
}

function subscribeShort(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(SHORT_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getShortSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(SHORT_MEDIA_QUERY).matches;
}

/**
 * Reactive hook returning `true` when the viewport is below
 * `MOBILE_BREAKPOINT_PX`. Tracks live resize / orientation changes via
 * `matchMedia`. Implemented with `useSyncExternalStore` so React reads from
 * the matchMedia store directly — no setState-in-effect, which the project's
 * `react-hooks/set-state-in-effect` lint rule rejects.
 *
 * SSR-safe: the server snapshot returns `false` (assume desktop on SSR;
 * client hydration updates to the real value on first paint).
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}
