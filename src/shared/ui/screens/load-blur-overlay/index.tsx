"use client";

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

  const [mounted, setMounted] = useState(() => {
    const s = useProgressStore.getState();
    return !(s.isLoaded && (!requireWarm || s.assetsWarmed));
  });

  useEffect(() => {
    if (!done) {
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
