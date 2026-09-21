"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

const SLOW_MS = 50;
const FAST_MS = 36;
/** Seconds of frames per decision. */
const WINDOW = 1;
/** How far quality may fall. Below 0.75 the canvas is soft enough that the
 *  scene reads as broken rather than as low-detail. */
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

    dpr.current = next;
    setDpr(next);
    cb.current?.(next);
  });

  return null;
}
