"use client";

/**
 * NavHud — a maps-style turn banner. ONE maneuver arrow shows the NEXT turn and
 * the distance to it ("50 m / Turn right"), with the destination + ETA alongside.
 * Stable (does not track the path). Distance-to-turn + maneuver come from
 * useNavInfo; the destination name is read from the route's end (nearest destination).
 * Visible only while walking.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ArrowUp, CornerUpLeft, CornerUpRight } from "lucide-react";

import type { PlayerControllerHandle } from "../../scene/player/types";
import type { DestinationsByCategory } from "@/shared/types";
import { NAV_GLASS_PANEL } from "../glass-theme";
import { useNavInfo } from "./use-nav-info";
import { fmtEta, fmtMeters } from "./format";

// Match the route's end to the nearest destination within this radius to name it.
const NAME_MATCH_METERS = 4;

export function NavHud({
  ctrlRef,
  visible,
  dests,
}: {
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  visible: boolean;
  /** destinations on the active floor — used to name the destination from the route end. */
  dests?: DestinationsByCategory;
}) {
  const info = useNavInfo(ctrlRef, visible);
  const show = visible && info.active;
  const arrive = info.turnDir === "arrive";

  const Icon =
    info.turnDir === "left" ? CornerUpLeft : info.turnDir === "right" ? CornerUpRight : ArrowUp;
  const maneuver = arrive
    ? "Arrive"
    : info.turnDir === "left"
      ? "Turn left"
      : info.turnDir === "right"
        ? "Turn right"
        : "Continue";

  // Destination name resolved from the route's end (nearest destination), or null.
  const [destName, setDestName] = useState<string | null>(null);
  const lastEndRef = useRef("");
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      const ctrl = ctrlRef.current;
      const path = ctrl?.isMoving() ? ctrl.getPath3D() : [];
      if (!ctrl || path.length === 0) return;
      const end = path[path.length - 1];
      const endKey = `${end.x.toFixed(1)},${end.z.toFixed(1)}`;
      if (endKey === lastEndRef.current) return;
      lastEndRef.current = endKey;
      const mpu = ctrl.getMetersPerUnit?.() || 1;
      let best = NAME_MATCH_METERS / mpu;
      let name: string | null = null;
      if (dests) {
        for (const list of Object.values(dests)) {
          for (const dest of list ?? []) {
            if (!dest.camera) continue;
            const d = Math.hypot(dest.camera.position[0] - end.x, dest.camera.position[2] - end.z);
            if (d < best) { best = d; name = dest.label; }
          }
        }
      }
      setDestName((prev) => (prev === name ? prev : name));
    }, 250);
    return () => clearInterval(id);
  }, [ctrlRef, visible, dests]);

  // Distance to the NEXT maneuver (the turn), split for big-number styling.
  const [turnVal, turnUnit = ""] = fmtMeters(info.turnMeters).split(" ");

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-[40%] z-[200] flex justify-center px-4 short:top-[44%]">
      <div
        className="flex h-[68px] w-[360px] max-w-full items-center gap-3.5 rounded-[14px] py-2.5 pl-2.5 pr-4 transition-opacity duration-[500ms] ease-out short:h-[58px] short:w-[320px] short:gap-3 short:rounded-[10px] short:py-2 short:pr-3.5 short:scale-[0.8]"
        style={{
          ...NAV_GLASS_PANEL,
          opacity: show ? 1 : 0,
        }}
      >
        {/* Next-turn arrow badge. */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] short:h-10 short:w-10 short:rounded-[8px]"
          style={{ background: "rgba(41,151,255,0.18)", border: "1.5px solid rgba(41,151,255,0.42)" }}
        >
          <Icon size={24} strokeWidth={2.6} color="#d6e6ff" className="short:h-5 short:w-5" />
        </div>

        {/* Distance-to-turn (big) + the maneuver. */}
        <div className="flex shrink-0 flex-col">
          <div className="flex items-baseline gap-1 whitespace-nowrap leading-none">
            <span className="nav-display text-[23px] font-bold leading-none text-white short:text-[19px]">{turnVal}</span>
            <span className="nav-display text-[13px] font-semibold leading-none short:text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>{turnUnit}</span>
          </div>
          <span className="nav-display mt-1.5 text-[13.5px] font-semibold leading-none short:text-[12px]" style={{ color: "#8fb4e0" }}>
            {maneuver}
          </span>
        </div>

        {/* Destination + ETA. */}
        <div className="ml-1 h-9 w-px shrink-0 short:h-8" style={{ background: "rgba(255,255,255,0.14)" }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="nav-display line-clamp-2 text-[14px] font-semibold leading-tight text-white short:text-[12.5px]">
            {destName ?? "Your destination"}
          </span>
          <span className="nav-display mt-1.5 truncate text-[16px] font-semibold leading-none short:text-[13px]" style={{ color: "rgba(255,255,255,0.88)" }}>
            {fmtEta(info.etaSec)} · {fmtMeters(info.meters)}
          </span>
        </div>
      </div>
    </div>
  );
}
