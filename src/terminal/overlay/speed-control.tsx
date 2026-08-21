"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PlayerControllerHandle } from "../scene/player";
import { navConfig } from "../navigation-config";

const SPEEDS = [1, 3, 5] as const;

/** Walk-speed multiplier control (1× / 3× / 5×), shown while walking.
 *
 *  The choice STICKS: it applies to the current walk and to every walk after
 *  it, until the page reloads. It is a setting, not per-walk state — dropping
 *  to 1× to look at something and having the next click silently restore 5×
 *  is the behaviour this replaced.
 *
 *  The controller's `speedMult` is the single source of truth: this control can
 *  be mounted twice at once (the 3D dock + the full-screen map's walking banner),
 *  so it POLLS the live value rather than holding an independent copy — otherwise
 *  setting 5× on the map left the dock showing a stale 1× (and vice versa). */
export function SpeedControl({ ctrlRef, vertical = false }: { ctrlRef: RefObject<PlayerControllerHandle | null>; vertical?: boolean }) {
  const [v, setV] = useState(navConfig.logic.defaultSpeedMult);
  // Keep in sync with the controller, so the two mounted copies agree.
  useEffect(() => {
    const id = setInterval(() => {
      const cur = ctrlRef.current?.getSpeedMultiplier();
      if (cur != null) setV((prev) => (prev === cur ? prev : cur));
    }, 200);
    return () => clearInterval(id);
  }, [ctrlRef]);
  const pick = (s: number) => {
    setV(s);
    ctrlRef.current?.setSpeedMultiplier(s);
  };
  return (
    <div
      className={
        vertical
          ? "flex flex-col items-stretch gap-0.5 rounded-[11px] p-[3px]"
          : "flex items-center gap-0.5 rounded-[14px] p-[3px]"
      }
      style={{ border: "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)" }}
    >
      {SPEEDS.map((s) => {
        const on = s === v;
        return (
          <button
            key={s}
            type="button"
            onClick={() => pick(s)}
            className={
              "nav-display cursor-pointer text-[12px] font-semibold transition-colors " +
              (vertical ? "rounded-[8px] px-1.5 py-1 text-center" : "rounded-[10px] px-2.5 py-1")
            }
            style={on ? { background: "var(--nav-accent)", color: "#fff" } : { color: "var(--nav-text-2)" }}
          >
            {s}×
          </button>
        );
      })}
    </div>
  );
}
