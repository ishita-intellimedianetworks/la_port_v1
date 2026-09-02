"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FADE_IN_MS, BLACKOUT_VISIBLE_MS } from "./";

/**
 * useFadeTransition
 * ─────────────────────────────────────────────────────────────────────────────
 * Same phase shape as the reference TeleportHandler:
 *
 *   idle → fadingIn → (swap) → [blackout hold] → fadingOut → idle
 *
 * Fade-in and fade-out always run for constant, EQUAL durations (FADE_IN_MS
 * === FADE_OUT_MS). The blackout hold between them is variable — it can be
 * gated on a `waitUntil` predicate so the screen stays fully opaque until the
 * destination model has actually finished loading. Falls back to
 * BLACKOUT_VISIBLE_MS (or 0) when no predicate is supplied.
 *
 * A safety cap (MAX_BLACKOUT_WAIT_MS) prevents a forever-blackout if the
 * predicate never goes true.
 */
const MAX_BLACKOUT_WAIT_MS = 8000;

// The CSS opacity ramp starts ~1 frame AFTER `setVisible(true)` commits, so it
// finishes slightly later than a `setTimeout(fadeMs)` would. If we run the swap
// (which UNMOUNTS the outgoing scene) exactly at fadeMs, the unmount can land
// while the overlay is still ~95% opaque — you glimpse the empty scene (blue
// background) for a frame. Holding full black for this buffer before swapping
// guarantees the overlay is fully opaque first.
const SWAP_BUFFER_MS = 120;

export interface FadeTransitionAPI {
  /** Bind to `<FadeScreen visible={...}/>`. */
  visible: boolean;
  /** Current fade-IN duration for this transition. Bind to
   *  `<FadeScreen fadeInMs={...}/>` so the CSS ramp matches the swap timing. */
  fadeInMs: number;
  /**
   * Fade in (over `fadeInMs`, default FADE_IN_MS), run `swap` at peak, hold
   * opaque until `waitUntil()` returns true (or the safety cap elapses), then
   * fade back out. Without `waitUntil` the hold is just BLACKOUT_VISIBLE_MS.
   */
  transition: (swap?: () => void, waitUntil?: () => boolean, fadeInMs?: number) => void;
  /**
   * Raise the screen without a swap callback — for cases where the swap is
   * timed by an external animation (e.g. dollhouse fly-in completion). After
   * fade-in completes, holds opaque until `waitUntil()` is true (or the
   * safety cap elapses), then auto-fades-out.
   */
  cue: (waitUntil?: () => boolean) => void;
  /**
   * Manually raise the fade (start fade-in). No auto fade-out — the caller is
   * responsible for calling `lower()` when ready. For sequenced cinematics
   * that need precise control over the blackout duration.
   */
  raise: () => void;
  /** Manually lower the fade (start fade-out). Pairs with `raise()`. */
  lower: () => void;
}

export function useFadeTransition(): FadeTransitionAPI {
  const [visible, setVisible] = useState(false);
  const [fadeInMs, setFadeInMs] = useState(FADE_IN_MS);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef     = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearPending = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current);   timerRef.current = null; }
    if (rafRef.current)   { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPending();
    };
  }, [clearPending]);

  // Wait for `waitUntil()` to return true (polling on rAF), then lower the
  // fade. Bounded by MAX_BLACKOUT_WAIT_MS so a misconfigured predicate can
  // never trap the user behind a permanent black screen. Falls back to a
  // single setTimeout when no predicate is provided.
  const holdThenLower = useCallback((waitUntil?: () => boolean) => {
    if (!mountedRef.current) return;

    const lower = () => {
      if (!mountedRef.current) return;
      setVisible(false);
    };

    if (!waitUntil) {
      if (BLACKOUT_VISIBLE_MS > 0) {
        timerRef.current = setTimeout(lower, BLACKOUT_VISIBLE_MS);
      } else {
        lower();
      }
      return;
    }

    if (waitUntil()) { lower(); return; }

    const start = performance.now();
    const tick = () => {
      if (!mountedRef.current) return;
      if (waitUntil() || performance.now() - start >= MAX_BLACKOUT_WAIT_MS) {
        rafRef.current = null;
        lower();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const transition = useCallback((swap?: () => void, waitUntil?: () => boolean, fadeMs: number = FADE_IN_MS) => {
    clearPending();
    setFadeInMs(fadeMs);
    setVisible(true);
    // Run the swap once the overlay is FULLY opaque — that's fadeMs (the CSS
    // ramp) PLUS a small buffer to absorb the ramp's ~1-frame start lag. The
    // swap unmounts the outgoing scene, so it must not fire while the overlay
    // is still partially transparent (else the empty scene flashes through).
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      timerRef.current = null;
      swap?.();
      holdThenLower(waitUntil);
    }, fadeMs + SWAP_BUFFER_MS);
  }, [clearPending, holdThenLower]);

  const cue = useCallback(
    (waitUntil?: () => boolean) => transition(undefined, waitUntil),
    [transition],
  );

  const raise = useCallback(() => {
    clearPending();
    setVisible(true);
  }, [clearPending]);

  const lower = useCallback(() => {
    clearPending();
    setVisible(false);
  }, [clearPending]);

  return { visible, fadeInMs, transition, cue, raise, lower };
}
