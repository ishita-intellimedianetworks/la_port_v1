"use client";

// Single source of truth for fade timing.
//
// FADE_IN_MS  = how long opacity ramps 0→1 (the screen darkening).
// FADE_OUT_MS = how long opacity ramps 1→0 (the new scene revealing).
// These MUST stay equal — the fade-in and fade-out durations of a single
// transition are visually symmetric on purpose, only the blackout hold in
// between is allowed to flex.
//
// FADE_MS is kept as an alias of FADE_IN_MS for callers that drive their own
// timing off the fade-in length (e.g. cue lead during the dollhouse fly-in).
//
// BLACKOUT_VISIBLE_MS is the FALLBACK static hold at full opacity between
// fade-in and fade-out when no readiness predicate is supplied to
// useFadeTransition. When a predicate is supplied (most transitions today),
// the hold instead lasts until the destination model has finished loading,
// capped by useFadeTransition's MAX_BLACKOUT_WAIT_MS safety timeout. The
// fallback is 0 so static teleports (same-floor home button / layout
// teleport) ramp straight back out the moment the swap completes.
export const FADE_IN_MS  = 800;
export const FADE_OUT_MS = 800;
export const FADE_MS = FADE_IN_MS;
export const BLACKOUT_VISIBLE_MS = 0;
export const FADE_EASING = "linear";


export const ENTER_FADE_MS = 340;

interface FadeScreenProps {
  visible: boolean;
  zIndex?: number;
  /** Fade-IN (darkening) duration. Defaults to FADE_IN_MS; the ext→int enter
   *  passes the shorter ENTER_FADE_MS for a quick late blackout. Fade-OUT
   *  always uses FADE_OUT_MS so reveals stay symmetric. */
  fadeInMs?: number;
}

export function FadeScreen({ visible, zIndex = 900, fadeInMs = FADE_IN_MS }: FadeScreenProps) {
  return (
    <div
      aria-hidden
      style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        left:          0,
        zIndex,
        background:    "#000",
        // Capture pointer events while the blackout is up so clicks can't fall
        // through to the UI behind it mid-transition (e.g. hitting "return to
        // exterior" during the ext→int enter blackout). Released the moment the
        // fade starts clearing (visible=false) so the revealed scene is
        // interactive immediately.
        pointerEvents: visible ? "auto" : "none",
        opacity:       visible ? 1 : 0,
        willChange:    "opacity",
        transition:    `opacity ${visible ? fadeInMs : FADE_OUT_MS}ms ${FADE_EASING}`,
      }}
    />
  );
}
