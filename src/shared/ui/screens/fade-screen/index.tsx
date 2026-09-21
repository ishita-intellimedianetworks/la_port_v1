"use client";

export const FADE_IN_MS  = 800;
export const FADE_OUT_MS = 800;
export const FADE_MS = FADE_IN_MS;
export const BLACKOUT_VISIBLE_MS = 0;
export const FADE_EASING = "linear";

export const ENTER_FADE_MS = 340;

interface FadeScreenProps {
  visible: boolean;
  zIndex?: number;
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
        pointerEvents: visible ? "auto" : "none",
        opacity:       visible ? 1 : 0,
        willChange:    "opacity",
        transition:    `opacity ${visible ? fadeInMs : FADE_OUT_MS}ms ${FADE_EASING}`,
      }}
    />
  );
}
