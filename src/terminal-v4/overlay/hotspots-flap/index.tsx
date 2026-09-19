"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HotspotConfig } from "@/config/schema";
import { useSite } from "@/config/context";
import { EdgeFlap } from "../edge-flap";
import { hasGroundView } from "../../ground-views";
import { PanelSearch } from "../panel-search";
import { TravelRow } from "../travel-row";
import { useLayoutNavigation } from "../use-layout-navigation";
import { useSecurityStore } from "../../stores/security-store";
import { useShortViewport } from "@/shared/responsive";

interface HotspotsFlapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Tuck the flap off-edge (walking, or an overlay owns the view). */
  tucked?: boolean;
}

/** The synthetic row's id. Not a layout in `layouts[]` — see `rows` below. */
const SECURITY_GROUP_ID = "SECURITY";

/**
 * One top-level row of the tree: a layout, or the Security group.
 *
 * They render identically and differ in one thing — whether the row itself
 * goes anywhere. A layout is a place, so tapping its name travels there. The
 * Security group is a CATEGORY: its children are spread across five different
 * layouts and it has no camera of its own, so tapping its name only unfolds it.
 */
interface TreeRow {
  id: string;
  name: string;
  children: HotspotConfig[];
  /** Null on a row that is not a destination. */
  travelTo: (() => void) | null;
  /** Children have a ground standpoint worth offering (operational only). */
  ground: boolean;
  autoOpen: boolean;
}

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
 *   Hotspot   tapping a nested hotspot travels to its OWN camera and narrows
 *             the scene to that one disc.
 *   Security  a synthetic row at the TOP, holding S01-S06. See below.
 *   Search    the admin tool's Resources search, carried over: it matches a
 *             row's code AND its name, across both levels, and unfolds a
 *             row whose CHILD matched so the hit is on screen rather than one
 *             chevron away.
 *
 * The panel NAVIGATES; it never shows data. A resource's readings live on its
 * disc in the scene, so reading them means arriving and clicking the disc.
 */
export function HotspotsFlap({ open, onOpenChange, disabled, tucked }: HotspotsFlapProps) {
  const { goToHotspot, goToHotspotGround, goToLayout } = useLayoutNavigation();
  // The chevron is drawn by an SVG component, not a class, so the short
  // viewport has to be read in JS to shrink it alongside its button.
  const chevronSize = useShortViewport() ? 15 : 18;

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Which row is unfolded — AT MOST ONE. Opening a second folds the first away,
  // so the tree stays one screenful instead of growing into a column the
  // operator has to scroll past to reach the next row.
  // An OVERRIDE, not the truth: `undefined` means "whatever the current search
  // implies", so a hit inside a row can unfold it without fighting a stored
  // value. Once a chevron is tapped the choice wins — a row id, or null for
  // "the one that was open is now closed".
  // TAGGED with the query it was made under, and read only while that query is
  // still the live one. The alternative — clearing it from an effect on every
  // keystroke — is the same behaviour a render later, with a wasted render and
  // a frame where the old choice is still on screen.
  const site = useSite();
  // The live security table. Read here rather than from `site.securityHotspots`
  // for the same reason every other reader does: config seeds the layer, the
  // store owns it.
  const securityHotspots = useSecurityStore((s) => s.hotspots);

  const [expanded, setExpanded] = useState<{ query: string; openId?: string | null }>({
    query: "",
  });
  const openId = expanded.query === q ? expanded.openId : undefined;
  const toggleExpanded = useCallback(
    (rowId: string, fallback: boolean) => {
      setExpanded((prev) => {
        const current = prev.query === q ? prev.openId : undefined;
        const isOpen = current === undefined ? fallback : current === rowId;
        return { query: q, openId: isOpen ? null : rowId };
      });
    },
    [q],
  );

  /**
   * The filtered tree. A row survives when IT matches — and then keeps all of
   * its children, because a place that matched should still show what is in it
   * — or when one of its children matches, in which case only the matching
   * children are listed and the row unfolds itself.
   *
   * Matching is over the code AND the name, though only the name is on the row.
   * The ids stay searchable because they are the handoff's stable identifiers
   * and someone working from that document can still jump straight to L03 or
   * S04 — a filter that accepts more than it shows costs nothing, whereas one
   * that rejects an id the spec calls out reads as broken.
   *
   * SECURITY LEADS THE LIST. It is one row rather than a group repeated under
   * each of the five layouts its anchors belong to: the security capabilities
   * are read as a set ("what can this terminal see"), not as facilities filed
   * at a place, and spreading six rows across five folds made the set
   * impossible to take in. It sits first because it is the shortest row and the
   * one being demonstrated; the operational layouts keep their own order below
   * it, unchanged.
   */
  const rows = useMemo<TreeRow[]>(() => {
    const hit = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

    // ALL EIGHT. The spec calls S07 and S08 "logical" anchors, "not a physical
    // security-room location", and for a while that argued for keeping them out
    // of a list of places — but a capability nothing can open is worse than one
    // filed under a heading that does not quite fit. They are the only way into
    // the incident log and the command view, so they are in the list.
    const securityChildren = securityHotspots;
    const security: TreeRow | null = securityChildren.length
      ? {
          id: SECURITY_GROUP_ID,
          name: site.ui.panels.securityGroupLabel ?? "Security",
          children: securityChildren,
          // A CATEGORY, not a destination. Its anchors sit at five different
          // layouts, so there is no one pose the row could mean - pressing it
          // unfolds the list, which is the only thing it can honestly do.
          travelTo: null,
          ground: false,
          autoOpen: false,
        }
      : null;

    const layouts: TreeRow[] = site.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      children: layout.hotspots.map((id) => site.hotspotById[id]).filter((hp) => !!hp),
      travelTo: () => goToLayout(layout.id),
      ground: true,
      autoOpen: false,
    }));

    return [...(security ? [security] : []), ...layouts]
      .map((row) => {
        if (!q) return row;
        if (hit(row.id, row.name)) return row;
        const matched = row.children.filter((hp) => hit(hp.id, hp.name));
        return matched.length ? { ...row, children: matched, autoOpen: true } : null;
      })
      .filter((row) => row !== null);
  }, [site, q, securityHotspots, goToLayout]);

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
      label={site.ui.panels.hotspotsFlapLabel}
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
        {rows.map((row) => {
          const hasChildren = row.children.length > 0;
          const isOpen = openId === undefined ? row.autoOpen : openId === row.id;
          return (
            <li key={row.id} className="flex flex-col gap-1.5 short:gap-1">
              <div className="flex items-center gap-1.5 short:gap-1">
                {/* Leaves keep the same empty slot rather than sliding left,
                    so every row at one depth starts on the same line. */}
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={isOpen ? `Collapse ${row.name}` : `Expand ${row.name}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpanded(row.id, row.autoOpen)}
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
                  {/* A row with nowhere to go still LOOKS like its siblings -
                      same frame, same type - and unfolds instead of
                      travelling. Giving the Security row a different treatment
                      would make the one new thing in the panel the one thing
                      that reads as foreign. */}
                  <TravelRow
                    name={row.name}
                    showChevron={false}
                    onSelect={
                      row.travelTo
                        ? () => travel(row.travelTo!)
                        : () => toggleExpanded(row.id, row.autoOpen)
                    }
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
                  {row.children.map((hp) => (
                    <li key={hp.id}>
                      {/* The standing figure appears only on resources that
                          have an authored ground standpoint — a minority, and
                          deliberately so: it marks the ones worth seeing on
                          foot rather than implying every resource can be.
                          Security anchors have none authored, so the slot stays
                          empty on all six. */}
                      <TravelRow
                        name={hp.name}
                        showChevron={false}
                        // A row that is not a destination yet is listed, dim
                        // and inert - see `enabled` in the schema.
                        disabled={hp.enabled === false}
                        onSelect={() => travel(() => goToHotspot(hp.id))}
                        onWalk={
                          row.ground && hasGroundView(hp.id)
                            ? () => travel(() => goToHotspotGround(hp.id))
                            : undefined
                        }
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
