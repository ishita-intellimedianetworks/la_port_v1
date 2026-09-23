"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** `?debug=true` traces every rung of the ladder. The interesting number is
 *  not where it starts - it always starts at `maxDpr` - but where it settles:
 *  a walk down to MIN_DPR means the scene is being rendered below the display
 *  and upscaled, which reads as blur on every edge, geometry included. */
const TRACE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debug") === "true";

const SLOW_MS = 50;
const FAST_MS = 36;
const WINDOW = 1;
const MIN_DPR = 0.75;
const STEP = 0.25;

export function AdaptiveQuality({ maxDpr, onChange }: { maxDpr: number; onChange?: (dpr: number) => void }) {
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef(0);
  const frames = useRef(0);
  const dpr = useRef(maxDpr);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    dpr.current = maxDpr;
    setDpr(maxDpr);
    cb.current?.(maxDpr);
    if (TRACE) console.info(`[dpr] ceiling ${maxDpr}, device ${window.devicePixelRatio}`);
  }, [maxDpr, setDpr]);

  useFrame((_, delta) => {
    acc.current += delta;
    frames.current++;
    if (acc.current < WINDOW) return;
    const meanMs = (acc.current / frames.current) * 1000;
    acc.current = 0;
    frames.current = 0;

    let next = dpr.current;
    if (meanMs > SLOW_MS) next = Math.max(MIN_DPR, dpr.current - STEP);
    else if (meanMs < FAST_MS) next = Math.min(maxDpr, dpr.current + STEP);
    if (next === dpr.current) return;

    if (TRACE) {
      console.info(
        `[dpr] ${dpr.current} -> ${next} (frame ${meanMs.toFixed(1)}ms, ` +
          `${next < dpr.current ? "slower than" : "faster than"} ` +
          `${next < dpr.current ? SLOW_MS : FAST_MS}ms)`,
      );
    }
    dpr.current = next;
    setDpr(next);
    cb.current?.(next);
  });

  return null;
}
