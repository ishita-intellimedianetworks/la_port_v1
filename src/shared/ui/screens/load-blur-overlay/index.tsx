"use client";

/**
 * LoadBlurOverlay — a single frosted-glass layer between the R3F canvas and the
 * loader HUD, shown while a scene LOADS and faded out the moment the loader
 * finishes. Used by the standalone interior overlays AND the exterior.
 *
 * Clear condition depends on which loader it sits under (`requireWarm`):
 *   • interior (default, requireWarm=false) → clears on `isLoaded` alone.
 *     `assetsWarmed` is set ONLY by CacheWarmer on the first EXTERIOR load, so
 *     on a direct /unit-v2/[id] visit it stays false forever — gating on it
 *     there left the blur stuck through first-person.
 *   • exterior (requireWarm=true) → clears on `isLoaded && assetsWarmed`, the
 *     exact condition the exterior LoadingScreen uses to hide, so the blur
 *     stays up for as long as the loader HUD is on screen and they fade
 *     together.
 *
 * `isLoaded` is reset() per scene, so the overlay re-arms naturally on
 * client-side navigation.
 *
 * z-index 500 sits above the canvas (0) and below the loader HUD / FadeScreen
 * (1000), so the loader stays legible on top and transition blackouts cover
 * this layer. Purely visual — `pointer-events: none`.
 */

import { useEffect, useState } from "react";
import { useProgressStore } from "@/shared/stores/progress-store";

const FADE_MS = 700;

interface LoadBlurOverlayProps {
  /** Also wait for the whole-project cache warm (exterior loader behaviour). */
  requireWarm?: boolean;
}

export default function LoadBlurOverlay({ requireWarm = false }: LoadBlurOverlayProps) {
  const done = useProgressStore(
    (s) => s.isLoaded && (!requireWarm || s.assetsWarmed),
  );

  // Start mounted only if the loader isn't already done at mount — avoids a dark
  // flash on an int→ext restore (where the scene is already loaded). The overlay
  // re-arms per scene as the load flags flip back to false (see effect below).
  const [mounted, setMounted] = useState(() => {
    const s = useProgressStore.getState();
    return !(s.isLoaded && (!requireWarm || s.assetsWarmed));
  });

  useEffect(() => {
    if (!done) {
      // Fresh scene — reset() zeroed isLoaded. Re-arm the glass so the next
      // load is covered (matters on client-side nav between units, where this
      // component is not remounted).
      setMounted(true);
      return;
    }
    // Loader finished — fade out, then unmount after the fade so the
    // backdrop-filter stops sampling the live canvas.
    const t = window.setTimeout(() => setMounted(false), FADE_MS);
    return () => window.clearTimeout(t);
  }, [done]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      className={requireWarm ? "ui-load-blur ui-load-blur--strong" : "ui-load-blur"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        pointerEvents: "none",
        opacity: done ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    />
  );
}
