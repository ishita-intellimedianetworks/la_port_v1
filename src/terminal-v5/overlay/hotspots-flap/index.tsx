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
import { isFieldHotspot, useSecurityStore } from "../../stores/security-store";
import { useNavUiStore } from "../../stores/nav-ui-store";
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

export function HotspotsFlap({ open, onOpenChange, disabled, tucked }: HotspotsFlapProps) {
  const { goToHotspot, goToHotspotGround, goToLayout } = useLayoutNavigation();
  // The chevron is drawn by an SVG component, not a class, so the short
  // viewport has to be read in JS to shrink it alongside its button.
  const chevronSize = useShortViewport() ? 15 : 18;

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const site = useSite();
  const securityHotspots = useSecurityStore((s) => s.hotspots);

  const openCardFor = useCallback(
    (hp: HotspotConfig) => {
      const layout = site.layoutById[hp.layoutId];
      if (!layout) return;
      const siblings = securityHotspots.map((h) => h.id);
      useNavUiStore.getState().setHotspotInfo({
        destId: layout.id,
        hotspotId: hp.id,
        destLabel: layout.name,
        category: layout.zone,
        hotspotLabel: hp.name,
        index: siblings.indexOf(hp.id) + 1,
        total: siblings.length,
        position: hp.position,
      });
    },
    [site, securityHotspots],
  );

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

  const rows = useMemo<TreeRow[]>(() => {
    const hit = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

    const securityChildren = securityHotspots;
    const security: TreeRow | null = securityChildren.length
      ? {
          id: SECURITY_GROUP_ID,
          name: site.ui.panels.securityGroupLabel ?? "Security",
          children: securityChildren,
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
                <ul className="mb-1 ml-[52px] mt-0.5 flex list-none flex-col gap-1.5 short:mb-0.5 short:ml-[38px] short:gap-1">
                  {row.children.map((hp) => (
                    <li key={hp.id}>
                      <TravelRow
                        name={hp.name}
                        showChevron={false}
                        // A row that is not a destination yet is listed, dim
                        // and inert - see `enabled` in the schema.
                        disabled={hp.enabled === false}
                        onSelect={() =>
                          travel(() =>
                            goToHotspot(
                              hp.id,
                              isFieldHotspot(hp.id) ? undefined : () => openCardFor(hp),
                            ),
                          )
                        }
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
