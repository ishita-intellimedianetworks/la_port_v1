"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, DoorOpen, Footprints, LocateFixed, MapPin, type LucideIcon } from "lucide-react";
import type { DestinationRow } from "./use-destinations";

const HERE_BLUE = "#2997FF";

export const CROWD_DOT: Record<string, string> = {
  high: "#ff453a",
  med: "#ffd60a",
  low: "#30d158",
};
export const CROWD_WORD: Record<string, string> = {
  high: "Heavy",
  med: "Moderate",
  low: "Clear",
};

interface RowBodyProps {
  row: DestinationRow;
  selected: boolean;
  icon?: LucideIcon;
  here?: boolean;
}

export function DestinationRowBody({ row, selected, icon: Icon, here = false }: RowBodyProps) {
  const { dest, distLabel, etaLabel } = row;
  return (
    <div className="flex items-center gap-3 short:gap-2.5">
      {Icon && (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full short:h-[26px] short:w-[26px]"
          style={
            here
              ? { background: HERE_BLUE, boxShadow: "0 0 0 4px rgba(41,151,255,0.25)" }
              : { background: selected ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.10)" }
          }
        >
          {here ? (
            <MapPin size={16} strokeWidth={2.2} color="#ffffff" fill="rgba(255,255,255,0.25)" className="short:h-[13px] short:w-[13px]" />
          ) : (
            <Icon size={16} strokeWidth={2} color={selected ? "#ffffff" : "var(--nav-text-2)"} className="short:h-[13px] short:w-[13px]" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="nav-display break-words text-[15px] font-semibold leading-snug short:text-[13px]" style={{ color: "var(--nav-text)" }}>
          {dest.label}
          {dest.crowd && CROWD_DOT[dest.crowd] && (
            <span
              title={dest.crowdNote}
              className="ml-2 inline-flex items-center gap-1 whitespace-nowrap align-middle short:ml-1.5"
            >
              <span
                aria-hidden
                className="h-[8px] w-[8px] rounded-full short:h-[7px] short:w-[7px]"
                style={{ background: CROWD_DOT[dest.crowd], boxShadow: `0 0 6px ${CROWD_DOT[dest.crowd]}` }}
              />
              <span className="nav-body text-[10.5px] font-semibold short:text-[9.5px]" style={{ color: "var(--nav-text-2)" }}>
                {CROWD_WORD[dest.crowd]}
              </span>
            </span>
          )}
        </div>
        {here ? (
          <div className="nav-body mt-0.5 flex items-center gap-1 text-[12px] font-semibold short:text-[10.5px]" style={{ color: HERE_BLUE }}>
            <LocateFixed size={12} strokeWidth={2.5} className="shrink-0" />
            <span>You&rsquo;re here</span>
          </div>
        ) : (
          etaLabel && (
            <div className="nav-body mt-0.5 flex items-center gap-1.5 text-[12.5px] font-normal short:text-[10.5px]" style={{ color: "var(--nav-text-dim)" }}>
              <Footprints size={12} strokeWidth={2} className="shrink-0 short:h-[10px] short:w-[10px]" />
              <span>{etaLabel}</span>
            </div>
          )
        )}
      </div>

      {!here && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {row.meters != null && (
            <div className="nav-display text-[15px] font-bold short:text-[12px]" style={{ color: selected ? "#ffffff" : "var(--nav-text)" }}>
              {distLabel}
            </div>
          )}
          <ChevronRight size={15} strokeWidth={2.2} color="var(--nav-text-faint)" className="short:h-[12px] short:w-[12px]" />
        </div>
      )}
    </div>
  );
}

interface DestinationCardProps {
  row: DestinationRow;
  selected: boolean;
  onSelect: () => void;
  icon?: LucideIcon;
  now: number;
  here?: boolean;
  onExploreInside?: () => void;
}

export function DestinationCard({ row, onSelect, icon, here = false, onExploreInside }: DestinationCardProps) {
  if (here) {
    return (
      <div
        className="w-full cursor-default rounded-2xl px-3.5 py-3 short:rounded-xl short:px-2.5 short:py-2"
        style={{ background: "rgba(41,151,255,0.20)" }}
      >
        <DestinationRowBody row={row} selected={false} icon={icon} here />
        {onExploreInside && (
          <button
            type="button"
            title="Explore the room from inside"
            onClick={onExploreInside}
            className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] transition-[filter] hover:brightness-110 short:mt-2 short:h-9 short:gap-1.5 short:rounded-[10px]"
            style={{ background: "var(--nav-accent)", boxShadow: "0 10px 24px -6px rgba(0,113,227,0.5)" }}
          >
            <DoorOpen className="h-4 w-4 shrink-0 short:h-[13px] short:w-[13px]" color="#ffffff" strokeWidth={2} />
            <span className="nav-display whitespace-nowrap text-[14px] font-semibold text-white short:text-[12px]">
              Explore from inside
            </span>
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full cursor-pointer rounded-2xl px-3.5 py-3 text-left transition-colors short:rounded-xl short:px-2.5 short:py-2",
        "bg-white/[0.06] hover:bg-white/[0.10]",
      )}
    >
      <DestinationRowBody row={row} selected={false} icon={icon} here={false} />
    </button>
  );
}
