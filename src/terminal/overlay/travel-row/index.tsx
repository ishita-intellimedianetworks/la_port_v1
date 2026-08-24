"use client";

import { ChevronRight } from "lucide-react";

interface TravelRowProps {
  /** L01 / H01 — the stable identifier from the handoff. */
  code: string;
  name: string;
  onSelect: () => void;
  /** Trailing affordance. Off wherever a LEADING expand chevron already sits
   *  beside the row — two arrows on one line read as two separate controls. */
  showChevron?: boolean;
}

/**
 * One row of the Resources tree — a layout or one of its hotspots.
 *
 * Tapping it TRAVELS. Every row looks the same whatever the player is standing
 * on: there is no "you are here" or "currently selected" treatment, because a
 * highlight that marks where you already are is the one row you will never need
 * to press, and it competed with hover for the eye.
 */
export function TravelRow({ code, name, onSelect, showChevron = true }: TravelRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.09] sm:p-3.5"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1.5px solid rgba(255,255,255,0.12)",
      }}
    >
      <span
        className="nav-display shrink-0 text-[11px] font-semibold tabular-nums"
        style={{ color: "var(--nav-text)" }}
      >
        {code}
      </span>
      <span
        className="nav-display min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.03em] sm:text-[13.5px]"
        style={{ color: "var(--nav-text)" }}
      >
        {name}
      </span>
      {showChevron && (
        <ChevronRight
          size={15}
          strokeWidth={2}
          className="shrink-0"
          style={{ color: "var(--nav-text-faint)" }}
        />
      )}
    </button>
  );
}
