"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, DoorOpen, Footprints, LocateFixed, MapPin, type LucideIcon } from "lucide-react";
import type { DestinationRow } from "./use-destinations";

// Bright accent (matches --nav-accent-bright) — the darker #0A84FF was barely
// readable as small text over the dark glass panel.
const HERE_BLUE = "#2997FF";

/** Crowd tier → dot colour (red heavy · yellow moderate · blue clear) — shown
 *  inline on cards whose destination carries an authored `crowd` level (the
 *  memorial gates), replacing the separate Crowd Flow category. */
export const CROWD_DOT: Record<string, string> = {
  high: "#ff453a", // red
  med: "#ffd60a",  // yellow
  low: "#30d158",  // green — classic heat-map scale
};
/** Tier word shown beside the dot — a bare dot alone doesn't read as crowd. */
export const CROWD_WORD: Record<string, string> = {
  high: "Heavy",
  med: "Moderate",
  low: "Clear",
};

interface RowBodyProps {
  row: DestinationRow;
  selected: boolean;
  /** Category icon, shown as a leading tile beside the destination name. */
  icon?: LucideIcon;
  /** The player is currently standing at this destination — mark it "You're here". */
  here?: boolean;
}

/**
 * Shared card row (design): a leading circular pin tile, the name with the
 * walk time UNDER it (footprints + eta), and on the right the bold distance
 * over a disclosure chevron. The "You're here" row swaps the eta line for a
 * blue marker and drops the distance column.
 */
export function DestinationRowBody({ row, selected, icon: Icon, here = false }: RowBodyProps) {
  const { dest, distLabel, etaLabel } = row;
  return (
    <div className="flex items-center gap-3 short:gap-2.5">
      {/* Leading circular pin tile — solid blue when standing here. */}
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

      {/* Name with the walk time under it — wraps (breaking long words) so it's
          never cut to "…" and never forces a horizontal scrollbar. */}
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
              {/* Tier word stays in the normal muted text colour — the DOT
                  carries the tier colour (matches the map treatment). */}
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

      {/* Bold distance over a disclosure chevron — hidden when already here.
          Teleport-only destinations (fly-overs, off-mesh spots) have no
          walking distance, so no "—" placeholder either; just the chevron. */}
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
  /** Category icon, rendered as the row's leading tile. */
  icon?: LucideIcon;
  /** Unused now — kept for call-site compatibility (transit shown in selected card). */
  now: number;
  /** The player is standing at this destination — shows the blue "You're here" card. */
  here?: boolean;
  /** Walk-in interior (the Athletes' Hostel): renders an "Explore from inside"
   *  action ON the "You're here" card — the standing-at destination never opens
   *  the directions view, so this card is the only panel surface it can live on. */
  onExploreInside?: () => void;
}

/** A result card in the list (design: each row is a visible dark card with a
 *  gap to its neighbours). The row the player is standing at is a solid blue
 *  "You're here" card and is non-interactive. */
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
