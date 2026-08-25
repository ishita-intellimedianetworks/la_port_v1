/**
 * Single source of truth for the viewport breakpoints used in JS code.
 *
 * Matches:
 *   • Tailwind's `lg:` breakpoint (≥ 1024 px = desktop styling)
 *   • The `@media (max-width: 1023px)` block in `globals.css` that scales the
 *     glass blur radius down on small screens
 *   • The `short:` custom variant (`@media (max-height: 540px)`)
 *
 * Anywhere code needs to ask "is this phone-sized?" should import from here —
 * do NOT hand-roll `window.innerWidth < 768` or `matchMedia("(max-width:
 * 767px)")` calls. Inconsistent thresholds make the UI flip styles at
 * different sizes depending on which component you look at.
 *
 * `isLowPower()` in `shared/runtime/index.ts` is intentionally separate — it's
 * a device-capability heuristic (used to throttle materials / postFX), not a
 * layout breakpoint, so it can keep its own threshold.
 */
"use client";

import { useSyncExternalStore } from "react";

export const MOBILE_BREAKPOINT_PX = 1024;

/** Media query string for "mobile". Use with `matchMedia` or in JSX. */
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

// Height breakpoint — mirrors the CSS `short:` custom variant
// (`@media (max-height: 540px)` in globals.css), i.e. a landscape phone. Use
// `useShortViewport()` when JS needs to size things (canvas px, flap geometry)
// the same way the `short:` Tailwind classes restyle the rest of the UI.
export const SHORT_BREAKPOINT_PX = 540;
export const SHORT_MEDIA_QUERY = `(max-height: ${SHORT_BREAKPOINT_PX}px)`;

/**
 * The largest SHORT EDGE we still call a phone.
 *
 * 767 rather than 1023: in portrait the short edge IS the width, so this keeps
 * every phone (≤ 430 px on the widest current handset) on the phone side while
 * letting a 768 px iPad — and every larger tablet — through. It exists so the
 * landscape guard can nag a phone without also nagging a tablet or a tall
 * desktop window.
 */
export const PHONE_MAX_EDGE_PX = 767;

/**
 * "A phone being held upright."
 *
 * THREE conditions, all required — dropping any one of them mis-fires:
 *   • `orientation: portrait` — the thing we actually want to correct.
 *   • `max-width` — in portrait the width is the short edge, so this admits
 *     phones and excludes tablets. Without it an iPad in portrait, which has
 *     plenty of room for the UI, gets told to rotate.
 *   • `pointer: coarse` — the primary input is a finger. Without it a desktop
 *     browser in a tall, narrow window gets told to "rotate your phone".
 */
export const PHONE_PORTRAIT_MEDIA_QUERY =
  `(orientation: portrait) and (max-width: ${PHONE_MAX_EDGE_PX}px) and (pointer: coarse)`;

/**
 * Reactive `matchMedia` binding.
 *
 * Implemented with `useSyncExternalStore` so React reads from the matchMedia
 * store directly — no setState-in-effect, which the project's
 * `react-hooks/set-state-in-effect` lint rule rejects.
 *
 * SSR-safe: the server snapshot returns `false` (assume the roomy case on SSR;
 * client hydration corrects it on first paint).
 */
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

/** Reactive hook: `true` on a phone held in portrait. See the query above. */
export function usePhonePortrait(): boolean {
  return useMediaQuery(PHONE_PORTRAIT_MEDIA_QUERY);
}

// `useSyncExternalStore` compares the subscribe/getSnapshot identities, so a
// fresh closure per render would resubscribe every render. One memo per query
// string keeps them stable for the life of the page.
const stores = new Map<string, [(cb: () => void) => () => void, () => boolean]>();

function store(query: string): [(cb: () => void) => () => void, () => boolean] {
  const hit = stores.get(query);
  if (hit) return hit;
  const made: [(cb: () => void) => () => void, () => boolean] = [
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
  ];
  stores.set(query, made);
  return made;
}

function getServerSnapshot(): boolean {
  return false;
}
