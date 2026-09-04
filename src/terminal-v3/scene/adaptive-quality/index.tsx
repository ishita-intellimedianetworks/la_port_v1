"use client";

/**
 * Pixel ratio that follows the frame rate.
 *
 * `stream.render.maxDpr` is a CEILING, not a promise. On a retina panel a DPR of
 * 2 is four times the fragments of DPR 1, and this scene is fill-heavy — a few
 * thousand draw calls over a full-screen canvas — so the same build that runs
 * comfortably on a desktop GPU can be fill-bound on an integrated one at the
 * identical settings. Resolution is the cheapest thing to give up: dropping to
 * DPR 1 costs sharpness and nothing else, where dropping geometry costs whole
 * buildings and dropping the streaming radius costs the view.
 *
 * The loop is deliberately sluggish in BOTH directions. It samples a whole
 * second before acting, so a single stutter (a chunk decode, a texture upload,
 * a GC pause) cannot move it; and it climbs back one step at a time, only while
 * comfortably above target, so a scene sitting near the threshold settles
 * instead of oscillating between two resolutions — which is far more visible
 * than simply running at the lower one.
 *
 * Nothing here overrides the authored ceiling: DPR only ever moves DOWN from
 * `maxDpr`, and only when the device has demonstrated it cannot hold the rate.
 *
 * Ported from LA_PORT_ADAPTIVE's `src/runtime/three/AdaptiveQuality.tsx`.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Frame budget. 50 ms is 20 fps — the point where a walk stops reading as
 *  motion. Deliberately not 60 fps: chasing it would drop resolution on
 *  machines that look perfectly fine at 40. */
const SLOW_MS = 50;
/** Climb back only when there is real headroom, so the two thresholds cannot
 *  chatter against each other.
 *
 *  RAISED FROM 25 ms (40 fps) BECAUSE THE RENDER LOOP IS NOW CAPPED. `delta`
 *  here is wall-clock time between RENDERED frames, and CanvasWithWrapper's
 *  FrameLimiter holds that at the cap — 33 ms on a low-power device at 30 fps —
 *  however little work the frame actually took. Against a 25 ms threshold that
 *  reads as "no headroom" on every device forever: DPR could still fall on a
 *  stall and could never climb back, so one slow second during a chunk decode
 *  would soften the canvas permanently. That is the blur this whole DPR ladder
 *  exists to avoid, arrived at from the other direction.
 *
 *  36 ms clears the 30 fps cap (33.3) with a little slack and still sits well
 *  under SLOW_MS, so the two keep 14 ms of hysteresis between them. KEEP IT
 *  ABOVE `1000 / FPS_CAP_LOW_POWER` — lower the cap and this has to move too,
 *  or the ratchet comes back. */
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

  // A new ceiling (the mobile profile resolving after mount, or a view swap)
  // resets the ladder — otherwise a value earned under the old ceiling silently
  // caps the new one.
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
