"use client";

/**
 * useNavInfo
 * ─────────────────────────────────────────────────────────────────────────────
 * Derives Google-Maps-style turn-by-turn info from the live player path, the
 * way a maps app shows "Turn left in 40 m · 2 min".
 *
 * Polls the PlayerController handle each frame (cheap reads, no re-render) and
 * only pushes React state when a *rounded* value actually changes — so the HUD
 * re-renders a handful of times per second, not every frame.
 *
 * Distance / time are REAL-WORLD values: the world-unit path length is scaled
 * to metres (getMetersPerUnit) and the ETA uses a human walking pace, NOT the
 * fast in-app camera speed. That's why the minutes are realistic instead of
 * elapsing in seconds.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PlayerControllerHandle } from "../../scene/player/types";
import { etaSeconds } from "./format";
import { navConfig } from "../../navigation-config";

const TURN_MIN_DEG = navConfig.logic.turnMinDeg;
const RIGHT_IS_POSITIVE_CROSS = navConfig.logic.rightIsPositiveCross;

export interface NavInfo {
  active: boolean;
  /** Real seconds for a person to walk the remaining route. */
  etaSec: number;
  /** Real distance left (metres). */
  meters: number;
  turnDir: "left" | "right" | "straight" | "arrive";
  /** Real distance to the next maneuver (metres). */
  turnMeters: number;
}

const EMPTY: NavInfo = { active: false, etaSec: 0, meters: 0, turnDir: "straight", turnMeters: 0 };

export function useNavInfo(ctrlRef: RefObject<PlayerControllerHandle | null>, enabled: boolean): NavInfo {
  const [info, setInfo] = useState<NavInfo>(EMPTY);
  const lastKey = useRef("");

  useEffect(() => {
    // Don't setState synchronously here — the consumer (NavHud) gates display
    // on `visible`, so stale info while disabled is never shown. Resetting the
    // throttle key makes the first frame after re-enabling push fresh state.
    if (!enabled) {
      lastKey.current = "";
      return;
    }

    let raf = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // The banner only shows whole metres/seconds — recomputing every frame is
      // wasted work (and GC churn). ~6 Hz is plenty and lighter on the main
      // thread, which keeps the walk loop smooth.
      if (frame++ % 10 !== 0) return;
      const ctrl = ctrlRef.current;
      const path = ctrl?.isMoving() ? ctrl.getPath() : [];
      if (!ctrl || path.length === 0) {
        if (lastKey.current !== "off") {
          lastKey.current = "off";
          setInfo(EMPTY);
        }
        return;
      }

      // Display scale (shared with the destination cards) — NOT the physical
      // getMetersPerUnit(), so the banner's distance/ETA matches the cards.
      const mpu = navConfig.logic.displayMetersPerUnit;
      const pos = ctrl.getPosition();
      const pts = [{ x: pos.x, z: pos.z }, ...path];

      let total = 0;
      const seg: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        seg.push(d);
        total += d;
      }

      let turnDir: NavInfo["turnDir"] = "arrive";
      let turnDist = total;
      let cum = 0;
      for (let k = 1; k < pts.length - 1; k++) {
        cum += seg[k - 1];
        const ax = pts[k].x - pts[k - 1].x;
        const az = pts[k].z - pts[k - 1].z;
        const bx = pts[k + 1].x - pts[k].x;
        const bz = pts[k + 1].z - pts[k].z;
        const al = Math.hypot(ax, az) || 1;
        const bl = Math.hypot(bx, bz) || 1;
        const dot = (ax * bx + az * bz) / (al * bl);
        const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
        if (ang >= TURN_MIN_DEG) {
          const cross = az * bx - ax * bz;
          turnDir = cross > 0 === RIGHT_IS_POSITIVE_CROSS ? "right" : "left";
          turnDist = cum;
          break;
        }
      }

      const meters = total * mpu;
      // The speed multiplier (1×/5×/10×) makes the player arrive faster, so the
      // remaining TIME shrinks by the same factor (distance is unchanged).
      const mult = ctrl.getSpeedMultiplier?.() ?? 1;
      const etaSec = etaSeconds(total, mpu) / mult;
      const turnMeters = turnDist * mpu;

      const key = `${turnDir}:${Math.round(turnMeters)}:${Math.round(meters)}:${Math.round(etaSec)}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        setInfo({ active: true, etaSec, meters, turnDir, turnMeters });
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctrlRef, enabled]);

  return info;
}
