"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { HOTSPOT_BY_ID, layouts, ui as uiCopy } from "@/config";
import { EdgeFlap } from "../edge-flap";
import { PanelSearch } from "../panel-search";
import { TravelRow } from "../travel-row";
import { useLayoutNavigation } from "../use-layout-navigation";
import { useShortViewport } from "@/shared/responsive";

interface HotspotsFlapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Tuck the flap off-edge (walking, or an overlay owns the view). */
  tucked?: boolean;
}

/** Stable empty map, so "no overrides for this query" is not a new object each render. */
const EMPTY_OVERRIDES: Record<string, boolean> = {};

/**
 * The LEFT edge flap: the single "Resources" panel. Per the handoff, a
 * hotspot is a layout's CHILD, not a peer entry of its own — so layouts lead
 * the list and their hotspots only ever appear nested under one.
 *
 * It is a LIST AND NOTHING ELSE. There is no detail view behind a row: tapping
 * one travels there and closes the panel, because that is the only thing the
 * row was ever going to do. The card that used to sit in between — overview,
 * distance, walking time, walk / teleport — asked the operator to confirm a
 * choice they had already made.
 *
 *   List      every layout, each with an expand toggle that unfolds its
 *             hotspots IN PLACE — no navigation, just reveals the rows.
 *   Layout    tapping a layout row travels there. Arriving shows every disc
 *             filed under it.
 *   Hotspot   tapping a nested hotspot travels to its parent layout — the two
 *             share one camera — and narrows the scene to that one disc.
 *   Search    the admin tool's Resources search, carried over: it matches a
 *             row's code AND its name, across both levels, and unfolds a
 *             layout whose HOTSPOT matched so the hit is on screen rather
 *             than one chevron away.
 *
 * The panel NAVIGATES; it never shows data. A resource's readings live on its
 * disc in the scene, so reading them means arriving and clicking the disc.
 */
export function HotspotsFlap({ open, onOpenChange, disabled, tucked }: HotspotsFlapProps) {
  const { goToHotspot, goToLayout } = useLayoutNavigation();
  // The chevron is drawn by an SVG component, not a class, so the short
  // viewport has to be read in JS to shrink it alongside its button.
  const chevronSize = useShortViewport() ? 15 : 18;

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Which layout rows are unfolded. An OVERRIDE map, not the truth: an absent
  // entry means "whatever the current search implies", so a hit inside a layout
  // can unfold it without fighting a stored value.
  //
  // TAGGED with the query it was made under, and read only while that query is
  // still the live one. The alternative — clearing it from an effect on every
  // keystroke — is the same behaviour a render later, with a wasted render and
  // a frame where the old overrides are still on screen.
  const [expanded, setExpanded] = useState<{ query: string; map: Record<string, boolean> }>({
    query: "",
    map: {},
  });
  const overrides = expanded.query === q ? expanded.map : EMPTY_OVERRIDES;
  const toggleExpanded = useCallback(
    (layoutId: string, fallback: boolean) => {
      setExpanded((prev) => {
        const map = prev.query === q ? prev.map : {};
        return { query: q, map: { ...map, [layoutId]: !(map[layoutId] ?? fallback) } };
      });
    },
    [q],
  );

  /**
   * The filtered tree. A layout survives when IT matches — and then keeps all
   * of its hotspots, because a place that matched should still show what is in
   * it — or when one of its hotspots matches, in which case only the matching
   * hotspots are listed and the row unfolds itself.
   *
   * Matching is over the code and the name, which is exactly the text the row
   * puts on screen: searching for something that is not visible anywhere is how
   * a filter starts looking broken.
   */
  const rows = useMemo(() => {
    const hit = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));
    return layouts
      .map((layout) => {
        const children = layout.hotspots
          .map((id) => HOTSPOT_BY_ID[id])
          .filter((hp) => !!hp);
        if (!q) return { layout, children, autoOpen: false };
        if (hit(layout.id, layout.name)) return { layout, children, autoOpen: false };
        const matched = children.filter((hp) => hit(hp.id, hp.name));
        return matched.length ? { layout, children: matched, autoOpen: true } : null;
      })
      .filter((row) => row !== null);
  }, [q]);

  // Travelling is the end of the panel's job, so it closes and forgets the
  // search — reopening onto a half-typed filter reads as a bug.
  const travel = useCallback(
    (go: () => void) => {
      go();
      setQuery("");
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <EdgeFlap
      side="left"
      label={uiCopy.panels.hotspotsFlapLabel}
      // No in-panel title — the flap's own edge tab already reads "RESOURCES",
      // and with no detail view there is nothing to go back FROM either.
      title=""
      subtitle=""
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      toolbar={<PanelSearch value={query} onChange={setQuery} placeholder="Search resources" />}
      disabled={disabled}
      tucked={tucked}
    >
      {/* One chevron, on the LEADING edge, swapping right/down; children set in
          by a fixed step and otherwise styled exactly like their parent; no
          connector rails. Depth is carried by the indent and the chevron alone,
          the way the admin tool draws its Resources tree. */}
      <ul className="flex list-none flex-col gap-1.5 short:gap-1">
        {rows.length === 0 && (
          <li
            className="nav-body px-1 py-6 text-center text-[13px] font-normal short:py-4 short:text-[12px]"
            style={{ color: "var(--nav-text-dim)" }}
          >
            No resources match &ldquo;{query.trim()}&rdquo;
          </li>
        )}
        {rows.map(({ layout, children, autoOpen }) => {
          const hasChildren = children.length > 0;
          // The override wins where it exists; otherwise the search decides.
          const isOpen = overrides[layout.id] ?? autoOpen;
          return (
            <li key={layout.id} className="flex flex-col gap-1.5 short:gap-1">
              <div className="flex items-center gap-1.5 short:gap-1">
                {/* Leaves keep the same empty slot rather than sliding left,
                    so every row at one depth starts on the same line. */}
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${layout.name}` : `Expand ${layout.name}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpanded(layout.id, autoOpen)}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08] short:h-7 short:w-7"
                  >
                    {isOpen ? (
                      <ChevronDown size={chevronSize} strokeWidth={2.2} style={{ color: "var(--nav-text)" }} />
                    ) : (
                      <ChevronRight
                        size={chevronSize}
                        strokeWidth={2.2}
                        style={{ color: "var(--nav-text-dim)" }}
                      />
                    )}
                  </button>
                ) : (
                  <div className="h-8 w-8 shrink-0 short:h-7 short:w-7" />
                )}
                <div className="min-w-0 flex-1">
                  <TravelRow
                    code={layout.id}
                    name={layout.name}
                    showChevron={false}
                    onSelect={() => travel(() => goToLayout(layout.id))}
                  />
                </div>
              </div>

              {isOpen && (
                // Set in past the chevron slot AND past where the parent's own
                // row begins, so the children read as a block hanging off the
                // parent rather than a continuation of the same list. The extra
                // top/bottom margin gives the unfolded group air, so a long
                // list does not run together into one column of chips.
                <ul className="mb-1 ml-[52px] mt-0.5 flex list-none flex-col gap-1.5 short:mb-0.5 short:ml-[38px] short:gap-1">
                  {children.map((hp) => (
                    <li key={hp.id}>
                      <TravelRow
                        code={hp.id}
                        name={hp.name}
                        showChevron={false}
                        onSelect={() => travel(() => goToHotspot(hp.id))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </EdgeFlap>
  );
}
