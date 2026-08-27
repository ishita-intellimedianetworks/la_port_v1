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
 * "The viewport is taller than it is wide."
 *
 * This is the whole landscape gate, and it is deliberately device-blind — the
 * app is landscape-only, so a portrait viewport of ANY kind gets the rotate
 * screen, exactly as ARCHVIZ_WITH_EXTERIOR does it (`innerWidth >
 * innerHeight`). The CSS keyword agrees with that comparison down to the
 * degenerate case: `portrait` is height >= width, so a square viewport is
 * portrait in both, and only width > height counts as landscape.
 *
 * It is written as the PORTRAIT question rather than the landscape one on
 * purpose. `getServerSnapshot` answers false for every query, so asking
 * "portrait?" makes SSR and the first client render answer "no" — the guard
 * stays out of the tree until matchMedia is real. Asking "landscape?" and
 * negating would render the rotate screen into the server HTML and flash it on
 * every desktop load before hydration corrected it.
 */
export const PORTRAIT_MEDIA_QUERY = "(orientation: portrait)";

/**
 * "This is a finger, not a mouse."
 *
 * Asked as a CAPABILITY question rather than a width one because the thing that
 * changes is the size of the pointing device, not the size of the screen: a
 * 10" tablet in landscape is wider than `MOBILE_BREAKPOINT_PX` and still needs
 * finger-sized hit targets, while a narrow desktop window does not. Anything
 * sizing a TAP TARGET (the 3D hotspot markers) should ask this; anything
 * sizing a LAYOUT should keep asking `useIsMobile()`.
 *
 * `(hover: none)` is paired with `(pointer: coarse)` on purpose — a laptop with
 * a touchscreen reports a coarse pointer as soon as a finger touches it, but it
 * still has a mouse, and blowing the markers up there would be wrong.
 */
export const COARSE_POINTER_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

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

// `useSyncExternalStore` compares the subscribe/getSnapshot identities, so a
// fresh closure per render would resubscribe every render. One memo per query
// string keeps them stable for the life of the page.
const stores = new Map<string, [(cb: () => void) => () => void, () => boolean]>();

function store(query: string): [(cb: () => void) => () => void, () => boolean] {
  const hit = stores.get(query);
  if (hit) return hit;
  // ONE MediaQueryList per query, shared by both halves. `getSnapshot` runs on
  // every render of every subscriber (and again after each notification), and
  // `window.matchMedia()` allocates a fresh object per call — cheap on its own,
  // wasteful once a per-instance component like the hotspot marker asks twice
  // per render, once per marker.
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
