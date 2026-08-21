export const tokens = {
  glass: {
    bg:         "rgba(15,23,42,0.55)",
    border:     "rgba(255,255,255,0.08)",
    blur:       "blur(12px)",
  },
  color: {
    text:   "rgba(226,232,240,0.9)",
    dim:    "rgba(148,163,184,0.7)",
    accent: "rgba(34,211,238,0.95)",
    border: "rgba(255,255,255,0.08)",
  },
  duration: { fast: 0.2, base: 0.4, slow: 0.7 },
  // Scene-entry UI choreography (interior + exterior). After a scene becomes
  // visible (blackout cleared / fly landed) we hold for `delayMs` so the model
  // reads alone for a beat, THEN slide the panels/bars in over `durationMs`.
  // The Tailwind slide classes use `duration-[900ms]` to match `durationMs`.
  uiEntrance: { delayMs: 700, durationMs: 900 },
  ease: {
    out:  "power2.out",
    expo: "expo.out",
    in:   "power2.in",
  },
} as const;
