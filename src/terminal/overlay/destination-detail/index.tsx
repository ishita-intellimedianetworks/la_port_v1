"use client";

import { Footprints, Zap } from "lucide-react";
import { ui as uiCopy } from "@/config";
import type { TravelEstimate } from "./use-travel-estimate";

interface DestinationDetailProps {
  /** L01 / H01 — shown beside the zone as the subheading. */
  code: string;
  /** Where this sits, e.g. "Waterside" or the parent layout for a resource. */
  context: string;
  /** The overview, verbatim from the handoff. */
  overview: string;
  /** Standing here already. */
  reached: boolean;
  /** A navmesh route exists AND both ends are on the ground. */
  walkable: boolean;
  estimate: TravelEstimate;
  onWalk: () => void;
  onTeleport: () => void;
}

/**
 * The selected destination, before travelling to it.
 *
 * Follows the reference's directions view — the same blue-tinted card, the
 * same big readout, the same Start / Teleport pair — with the turn-by-turn
 * route removed. The route belonged to a venue you could see across; over a
 * 205-acre terminal it is a list of a dozen "continue straight" legs nobody
 * reads, and the two numbers that matter are how far and how long.
 *
 * A destination with no walkable route says so plainly rather than showing a
 * blank time: aerial cameras have no navmesh under them, and teleport is not a
 * fallback there, it is the only way.
 */
export function DestinationDetail({
  code,
  context,
  overview,
  reached,
  walkable,
  estimate,
  onWalk,
  onTeleport,
}: DestinationDetailProps) {
  const measuring = walkable && estimate.meters == null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative rounded-2xl p-4 short:p-3"
        style={{
          background: "rgba(0,113,227,0.12)",
          boxShadow: "inset 0 0 0 1.5px rgba(41,151,255,0.6)",
        }}
      >
        <div
          className="nav-body text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--nav-text-faint)" }}
        >
          {code} · {context}
        </div>

        {/* The two figures that matter: how long, and how far. */}
        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="nav-display text-[18px] font-semibold leading-none text-white short:text-[16px]"
            style={{ letterSpacing: "-0.3px" }}
          >
            {reached
              ? uiCopy.travel.reachedLabel
              : !walkable
                ? uiCopy.travel.instantLabel
                : measuring
                  ? "—"
                  : estimate.etaLabel}
          </span>
          <span
            className="nav-body text-[12px] font-medium short:text-[11px]"
            style={{ color: "var(--nav-text-dim)" }}
          >
            {reached
              ? uiCopy.travel.reachedHint
              : !walkable
                ? uiCopy.travel.instantHint
                : measuring
                  ? uiCopy.travel.measuringHint
                  : `${estimate.distLabel} ${uiCopy.travel.onFoot}`}
          </span>
        </div>

        {!reached && (
          <div className="mt-4 flex gap-2.5 short:mt-2.5 short:gap-2">
            {walkable && (
              <button
                type="button"
                onClick={onWalk}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-[filter] hover:brightness-110 short:h-9 short:gap-1.5 short:rounded-[10px]"
                style={{
                  background: "var(--nav-accent)",
                  boxShadow: "0 10px 24px -6px rgba(0,113,227,0.5)",
                }}
              >
                <Footprints size={16} color="#ffffff" strokeWidth={2} className="shrink-0" />
                <span className="nav-display whitespace-nowrap text-[15px] font-semibold text-white short:text-[12px]">
                  {uiCopy.travel.walkLabel}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onTeleport}
              className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[14px] transition-[filter] hover:brightness-110 short:h-9 short:gap-1.5 short:rounded-[10px]"
              style={{
                background: "rgba(41,151,255,0.12)",
                border: "1.5px solid var(--nav-accent-bright)",
              }}
            >
              <Zap size={16} color="var(--nav-accent-bright)" strokeWidth={2} className="shrink-0" />
              <span
                className="nav-display whitespace-nowrap text-[15px] font-semibold short:text-[12px]"
                style={{ color: "var(--nav-accent-bright)" }}
              >
                {uiCopy.travel.teleportLabel}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* The overview, in the handoff's own words. */}
      <div>
        <div
          className="nav-body pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--nav-text-faint)" }}
        >
          {uiCopy.travel.overviewTitle}
        </div>
        <p
          className="nav-body text-[12.5px] font-normal leading-relaxed short:text-[11.5px]"
          style={{ color: "var(--nav-text-2)" }}
        >
          {overview}
        </p>
      </div>
    </div>
  );
}
