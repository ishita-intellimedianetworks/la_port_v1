"use client";

/**
 * PerfMeter — minimal in-canvas FPS / frame-time overlay for debug runs.
 *
 * Renders nothing in the 3D scene; uses useFrame to sample frame deltas and
 * writes the rolling stats into a fixed-position DOM div via a portal-free
 * imperative ref update. One read per second to keep DOM thrash off the
 * critical path.
 *
 * Mount this only when `debug={true}` from SceneContent.
 */

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function PerfMeter() {
  const elRef = useRef<HTMLDivElement | null>(null);

  const frameCount = useRef(0);
  const acc = useRef(0);
  const minDt = useRef(Infinity);
  const maxDt = useRef(0);
  const lastFlush = useRef(performance.now());

  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = [
      "position:fixed",
      "top:8px",
      "right:8px",
      "z-index:9999",
      "padding:6px 10px",
      "background:rgba(0,0,0,0.7)",
      "color:#0fb7ff",
      "font:11px/1.4 ui-monospace,monospace",
      "border:1px solid rgba(15,183,255,0.4)",
      "border-radius:4px",
      "pointer-events:none",
      "white-space:pre",
      "letter-spacing:0.04em",
    ].join(";");
    el.textContent = "perf…";
    document.body.appendChild(el);
    elRef.current = el;
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      elRef.current = null;
    };
  }, []);

  useFrame((_, delta) => {
    frameCount.current++;
    acc.current += delta;
    if (delta < minDt.current) minDt.current = delta;
    if (delta > maxDt.current) maxDt.current = delta;

    const now = performance.now();
    if (now - lastFlush.current < 1000) return;

    const fps = frameCount.current / acc.current;
    const avgMs = (acc.current / frameCount.current) * 1000;
    const minMs = minDt.current * 1000;
    const maxMs = maxDt.current * 1000;

    const el = elRef.current;
    if (el) {
      el.textContent =
        `${fps.toFixed(0)} fps\n` +
        `avg ${avgMs.toFixed(1)} ms\n` +
        `min ${minMs.toFixed(1)} ms\n` +
        `max ${maxMs.toFixed(1)} ms`;
    }

    frameCount.current = 0;
    acc.current = 0;
    minDt.current = Infinity;
    maxDt.current = 0;
    lastFlush.current = now;
  });

  return null;
}
