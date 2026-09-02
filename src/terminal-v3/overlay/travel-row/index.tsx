"use client";

import { ChevronRight, PersonStanding } from "lucide-react";

interface TravelRowProps {
  name: string;
  onSelect: () => void;
  /** Trailing affordance. Off wherever a LEADING expand chevron already sits
   *  beside the row — two arrows on one line read as two separate controls. */
  showChevron?: boolean;
  /**
   * Ground standpoint for this row, when it has one.
   *
   * Present only on the handful of resources that can be looked at from the
   * navmesh (see `ground-views.ts`), which is why it is a SECOND control rather
   * than a mode on the first: pressing the name still does what pressing a name
   * has always done — travel to the authored framing — and this adds the other
   * way of arriving without taking the default away from it.
   */
  onWalk?: () => void;
}

/**
 * One row of the Resources tree — a layout or one of its hotspots.
 *
 * Tapping it TRAVELS. Every row looks the same whatever the player is standing
 * on: there is no "you are here" or "currently selected" treatment, because a
 * highlight that marks where you already are is the one row you will never need
 * to press, and it competed with hover for the eye.
 *
 * A row with `onWalk` splits into two targets inside one frame: the name, and a
 * standing figure. The frame moved off the button and onto a wrapper so the two
 * can hover independently — a single hover lighting up both halves would have
 * said they were one control, which is the one thing they are not. Rows without
 * `onWalk` render the identical box with nothing in the second slot, so the
 * list keeps one silhouette either way.
 */
export function TravelRow({ name, onSelect, showChevron = true, onWalk }: TravelRowProps) {
  return (
    <div
      className="flex w-full items-stretch overflow-hidden rounded-2xl short:rounded-xl"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1.5px solid rgba(255,255,255,0.12)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        // `short:` trims the row to ~36px so a landscape phone shows a list
        // rather than three rows and a scrollbar. Still a comfortable tap target
        // at that height, and the type only drops half a point.
        className="flex min-w-0 flex-1 items-center gap-2.5 p-3 text-left transition-colors hover:bg-white/[0.09] sm:p-3.5 short:gap-2 short:p-2"
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
            {/* The bottom bar's First Person glyph, deliberately reused: this
                does the same KIND of thing that circle does — put you on the
                navmesh on foot — so it should not introduce a second symbol for
                it. */}
            <PersonStanding size={17} strokeWidth={2} style={{ color: "var(--nav-text)" }} />
          </button>
        </>
      )}
    </div>
  );
}
