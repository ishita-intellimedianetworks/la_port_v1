"use client";

import type { RefObject } from "react";
import { Footprints, Square, Zap } from "lucide-react";
import type { MapDestination } from "./hooks/use-minimap";
import type { PlayerControllerHandle } from "../scene/player";
import { SpeedControl } from "../overlay/speed-control";

interface MapDestinationControlsProps {
  isMoving: boolean;
  onStop: () => void;
  selected: MapDestination | null;
  onStart: () => void;
  onClear: () => void;
  onTeleport: () => void;
  /** For the in-walk speed control (mirrors the 3D dock). */
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  /** Memorial list-mode design: no idle hint text, no hairline separator. */
  listMode?: boolean;
}

/**
 * The map window's action footer — a sleek bar BELOW the floor plan (in-flow, so
 * it never overlaps the canvas). It reserves a fixed strip of space and shows:
 *  - walking: just a small Stop button.
 *  - a selected hotspot: its name + distance/ETA + Start / Teleport.
 *  - otherwise: a faint hint.
 */
export function MapDestinationControls({
  isMoving, onStop, selected, onStart, onTeleport, ctrlRef, listMode = false,
}: MapDestinationControlsProps) {
  // List-mode (memorial): the plan isn't clickable and destinations come from
  // the list below, so the idle bar shows nothing (no "select a hotspot" hint)
  // and there are no hairline separators in that design.
  return (
    <div
      className="flex min-h-[52px] shrink-0 items-center gap-2.5 px-3 py-2 short:min-h-[42px] short:gap-2 short:px-2 short:py-1.5"
      style={listMode ? undefined : { borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      {isMoving ? (
        // Same as the 3D walking dock: a blue Stop + the speed multiplier options.
        <div className="m-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onStop}
            title="Stop"
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[14px] pl-3 pr-4 transition-[filter] hover:brightness-110"
            style={{ background: "var(--nav-accent)" }}
          >
            <Square size={14} className="fill-white" color="#ffffff" strokeWidth={2} />
            <span className="nav-display text-[13px] font-semibold text-white">Stop</span>
          </button>
          <SpeedControl ctrlRef={ctrlRef} />
        </div>
      ) : selected ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="nav-display line-clamp-2 break-words text-[13.5px] font-semibold short:text-[12px]" style={{ color: "var(--nav-text)", letterSpacing: "-0.2px" }}>
              {selected.name}
            </span>
            <span className="nav-body flex items-center gap-1 truncate text-[11.5px] font-medium short:text-[10.5px]" style={{ color: "var(--nav-text-dim)" }}>
              {selected.walkable === false ? "Instant travel · teleport" : selected.distLabel}
              {selected.etaLabel && (
                <>
                  <Footprints size={11} strokeWidth={2} className="shrink-0 short:h-[10px] short:w-[10px]" />
                  {selected.etaLabel}
                </>
              )}
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {selected.accessible ? (
              <>
                {/* Walk only where a navmesh route exists — fly-overs and
                    off-mesh destinations are teleport-only. */}
                {selected.walkable !== false && (
                <button
                  type="button"
                  onClick={onStart}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[14px] px-3.5 transition-[filter] hover:brightness-110 short:h-7 short:gap-1 short:rounded-[10px] short:px-2.5"
                  style={{ background: "var(--nav-accent)" }}
                >
                  <Footprints size={13} color="#ffffff" strokeWidth={2} className="short:h-[11px] short:w-[11px]" />
                  <span className="nav-display text-[12.5px] font-semibold text-white short:text-[11px]">Start</span>
                </button>
                )}
                <button
                  type="button"
                  onClick={onTeleport}
                  title="Teleport"
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[14px] px-3 transition-colors hover:bg-white/[0.06] short:h-7 short:gap-1 short:rounded-[10px] short:px-2.5"
                  style={{ border: "1px solid rgba(255,255,255,0.18)" }}
                >
                  <Zap size={13} color="var(--nav-text)" strokeWidth={2} className="short:h-[11px] short:w-[11px]" />
                  <span className="nav-display text-[12.5px] font-semibold short:text-[11px]" style={{ color: "var(--nav-text)" }}>Teleport</span>
                </button>
              </>
            ) : (
              <span
                className="nav-display rounded-[14px] px-3 py-1.5 text-[12px] font-semibold"
                style={{ background: "rgba(232,69,60,0.14)", color: "#ff8a82" }}
              >
                Not accessible
              </span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
