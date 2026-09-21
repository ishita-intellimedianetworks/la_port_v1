"use client";

import { ChevronRight, PersonStanding } from "lucide-react";
import { cn } from "@/lib/utils";

interface TravelRowProps {
  name: string;
  onSelect: () => void;
  /** Trailing affordance. Off wherever a LEADING expand chevron already sits
   *  beside the row — two arrows on one line read as two separate controls. */
  showChevron?: boolean;
  onWalk?: () => void;
  disabled?: boolean;
}

export function TravelRow({
  name,
  onSelect,
  showChevron = true,
  onWalk,
  disabled = false,
}: TravelRowProps) {
  return (
    <div
      className={cn(
        "flex w-full items-stretch overflow-hidden rounded-2xl short:rounded-xl",
        disabled && "opacity-40",
      )}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1.5px solid rgba(255,255,255,0.12)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 p-3 text-left transition-colors sm:p-3.5 short:gap-2 short:p-2",
          disabled ? "cursor-default" : "cursor-pointer hover:bg-white/[0.09]",
        )}
      >
        <span
          className="nav-display min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.03em] sm:text-[13.5px] short:text-[12px]"
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

      {onWalk && (
        <>
          {/* Hairline, not a gap: the two targets have to read as one row split
              in two, not as two chips that happen to be adjacent. */}
          <span aria-hidden className="my-2 w-px shrink-0" style={{ background: "var(--nav-divider)" }} />
          <button
            type="button"
            onClick={onWalk}
            aria-label={`Stand at ${name}`}
            title="Ground view"
            className="flex shrink-0 cursor-pointer items-center justify-center px-3.5 transition-colors hover:bg-white/[0.12] short:px-2.5"
          >
            <PersonStanding size={17} strokeWidth={2} style={{ color: "var(--nav-text)" }} />
          </button>
        </>
      )}
    </div>
  );
}
