import type { CSSProperties } from "react";

/**
 * Inline glass recipes for the LA2028 overlays.
 *
 * IMPORTANT: these are applied INLINE, not via a CSS class. In this build a
 * custom `.nav-glass { backdrop-filter: … }` class does not composite over the
 * WebGL canvas (Tailwind v4 layer ordering / CSS HMR), while an inline
 * `backdropFilter` does — the bottom dock blurs, class-based surfaces don't. So
 * every overlay spreads one of these objects to get the frost reliably.
 *
 * Backdrop reuses the app's proven Apple-"Liquid Glass" token (`--ui-glass-backdrop`,
 * 10px desktop / 5px mobile). `isolation` + `will-change` give the surface its
 * own compositing layer so the blur samples the live scene inside animated
 * wrappers. No `transform` here, so callers keep their own positioning/animation.
 */
const BASE: CSSProperties = {
  backdropFilter: "var(--ui-glass-backdrop)",
  WebkitBackdropFilter: "var(--ui-glass-backdrop)",
  isolation: "isolate",
  willChange: "backdrop-filter",
};

/** Chip / pill / dock / toggle weight. */
export const NAV_GLASS: CSSProperties = {
  ...BASE,
  background: "var(--nav-glass)",
  border: "1px solid var(--nav-border)",
  boxShadow: "var(--nav-shadow-chip)",
};

/** Heavier panel weight (label panel, nav banner, map card). */
export const NAV_GLASS_PANEL: CSSProperties = {
  ...BASE,
  background: "var(--nav-glass-strong)",
  border: "1px solid var(--nav-border)",
  boxShadow: "var(--nav-shadow-panel)",
};
