import type { CSSProperties } from "react";

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
