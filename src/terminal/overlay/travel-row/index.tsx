"use client";

import { ChevronRight } from "lucide-react";

interface TravelRowProps {
  /** L01 / H01 — the stable identifier from the handoff. */
  code: string;
  name: string;
  /** Currently standing at / selected. */
  active: boolean;
  onSelect: () => void;
}

/**
 * One row of a travel list, shared by the layouts and resources flaps so the
 * two lists cannot drift apart.
 *
 * The row SELECTS rather than travels: it opens the destination view, where
 * the overview, the distance and the walking time are read before committing.
 * The earlier version travelled on tap with a separate walk button beside it,
 * which made the choice before showing what it cost.
 */
export function TravelRow({ code, name, active, onSelect }: TravelRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.09] sm:p-3.5"
      style={{
        background: active ? "rgba(43,124,255,0.16)" : "rgba(255,255,255,0.05)",
        border: active ? "1.5px solid var(--nav-accent)" : "1.5px solid rgba(255,255,255,0.12)",
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
      <ChevronRight
        size={15}
        strokeWidth={2}
        className="shrink-0"
        style={{ color: "var(--nav-text-faint)" }}
      />
    </button>
  );
}
