"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FADE_IN_MS, BLACKOUT_VISIBLE_MS } from "./";

const MAX_BLACKOUT_WAIT_MS = 8000;

const SWAP_BUFFER_MS = 120;

const POLL_MS = 16;

export interface FadeTransitionAPI {
  /** Bind to `<FadeScreen visible={...}/>`. */
  visible: boolean;
  /** Current fade-IN duration for this transition. Bind to
   *  `<FadeScreen fadeInMs={...}/>` so the CSS ramp matches the swap timing. */
  fadeInMs: number;
  transition: (swap?: () => void, waitUntil?: () => boolean, fadeInMs?: number) => void;
  cue: (waitUntil?: () => boolean) => void;
  raise: () => void;
  /** Manually lower the fade (start fade-out). Pairs with `raise()`. */
  lower: () => void;
}

export function useFadeTransition(): FadeTransitionAPI {
  const [visible, setVisible] = useState(false);
  const [fadeInMs, setFadeInMs] = useState(FADE_IN_MS);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearPending = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current);   timerRef.current = null; }
    if (pollRef.current)  { clearTimeout(pollRef.current);    pollRef.current = null; }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPending();
    };
  }, [clearPending]);

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
        pollRef.current = null;
        lower();
        return;
      }
      pollRef.current = setTimeout(tick, POLL_MS);
    };
    pollRef.current = setTimeout(tick, POLL_MS);
  }, []);

  const transition = useCallback((swap?: () => void, waitUntil?: () => boolean, fadeMs: number = FADE_IN_MS) => {
    clearPending();
    setFadeInMs(fadeMs);
    setVisible(true);
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
