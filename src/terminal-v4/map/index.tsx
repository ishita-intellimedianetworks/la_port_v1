"use client";

import { useEffect, useRef } from "react";

import type { MinimapData } from "./types";
import type { DestinationCategory } from "@/shared/types";
import { useMinimap } from "./hooks/use-minimap";
import { MapDestinationControls } from "./map-destination-controls";
import { MapSelect } from "./map-select";
import { iconFor } from "../overlay/destination-panel/subcategory-rail";
import { CROWD_DOT, CROWD_WORD } from "../overlay/destination-panel/destination-card";
import { ArrowLeft, ListFilter, LocateFixed, Maximize2, Minimize2, X } from "lucide-react";
import { NAV_GLASS_PANEL } from "../overlay/glass-theme";
import { useShortViewport } from "@/shared/responsive";
// Phone (landscape): the destination legend moves BESIDE the plan instead of
// below it — vertical space is scarce, horizontal is plentiful. Shared with
// use-minimap's sizing so the window (canvas + legend) fits the screen.
import { SIDE_LEGEND_W } from "./utils/constants";

export type { MinimapData };

interface MinimapProps {
  entered?: boolean;
  onReturnToExterior?: () => void;
  /** Fired whenever the full map opens/closes — lets the parent close the 3D
   *  overlays (label panel + selection) while the map covers the screen. */
  onExpandedChange?: (expanded: boolean) => void;
}

export function Minimap({ entered = true, onReturnToExterior, onExpandedChange }: MinimapProps) {
  const {
    canvasRef, mapWidth, mapHeight, radioWidth, expanded, closeMap, fullScreen, toggleFullScreen, handleClick,
    recenter, drifted,
    isMoving, stopNav, playerControllerRef,
    destCats, destLabel, pickDestLabel, mapOptions, mapOption, pickMapOption,
    mapDests, listMode, selectMapDestination,
    selectedPoi, startSelectedDest, teleportSelectedDest, clearDestSelection,
  } = useMinimap();

  // List-mode (memorial): ONE destination row per destination (its pins share the
  // number), in numbering order.
  const destSeen = new Set<string>();
  const dests = listMode ? mapDests.filter((p) => !destSeen.has(p.id) && (destSeen.add(p.id), true)) : [];
  const short = useShortViewport();
  const sideLegend = listMode && short;

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Keep wheel scrolling contained to the map window. Without this, scrolling
  // over the canvas/chrome (or past the end of the radio list) bubbles out and
  // scrolls the page / underlying scene behind the overlay. A non-passive
  // listener lets us preventDefault; the inner radio list still scrolls on its
  // own (it's tagged data-map-scroll + overscroll-contain).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    // Catch wheel at the DOCUMENT in the CAPTURE phase — earliest possible point,
    // before it can reach the page or the 3D scene behind the overlay. Any wheel
    // whose target is inside the map window has its default cancelled (so nothing
    // scrolls/zooms behind it). The floor-plan <canvas> keeps its own zoom: we
    // only preventDefault, and we don't stopPropagation over the canvas, so its
    // wheel-to-zoom listener still fires.
    const onWheel = (e: WheelEvent) => {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
      // Let an inner scrollable list (the category column, which scrolls on small
      // phones where it can't all fit) scroll natively — overscroll-contain stops
      // it from chaining to the page behind.
      const scroller = e.target instanceof Element ? (e.target.closest("[data-map-scroll]") as HTMLElement | null) : null;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) return;
      e.preventDefault();
      const overCanvas = e.target instanceof Element && !!e.target.closest("canvas");
      if (!overCanvas) e.stopPropagation();
    };
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, [expanded]);

  // The collapsed opener lives in the left sidebar (see Sidebar). `entered` is
  // kept in the props for call-site symmetry but no longer gates a tab here.
  void entered;

  return (
    // A floating, corner-resizable map window (NOT full-screen) — anchored beside
    // the sidebar, using the same glass surface as the other overlays.
    <div
      ref={rootRef}
      // Phone: the window may still be taller than the viewport (selector +
      // plan + footer + legend) — let it scroll vertically so the destination
      // options / directions footer are always reachable.
      className="fixed left-[88px] top-4 z-[260] flex max-h-[calc(100dvh-24px)] select-none flex-col overflow-hidden rounded-[14px] short:left-[54px] short:top-1 short:max-h-[calc(100dvh-8px)] short:overflow-y-auto short:overflow-x-hidden"
      style={{
        ...NAV_GLASS_PANEL,
        // Pin the window to the floor-plan + radio-column width (+ the root's 2px
        // border). Without this, a long hotspot name or the Start/Teleport row in
        // the footer would stretch the whole map wider; now the footer wraps to
        // fit instead.
        width: mapWidth + (destCats.length > 0 ? radioWidth : 0) + (sideLegend ? SIDE_LEGEND_W : 0) + 2,
        opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? "auto" : "none",
        transition: "opacity 0.25s ease-out",
      }}
    >
      {/* Title bar — "Map" + Exterior + close. List-mode (memorial) has NO
          hairline separators between sections (design: spacing only). */}
      <div
        className="flex h-11 shrink-0 items-center gap-2.5 px-3 short:h-9 short:gap-2 short:px-2.5"
        style={listMode ? undefined : { borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="nav-display text-[13px] font-semibold short:text-[12px]" style={{ color: "var(--nav-text-2)" }}>Map</span>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {onReturnToExterior && (
            <button
              onClick={onReturnToExterior}
              className="nav-display flex h-8 cursor-pointer items-center gap-1.5 rounded-[14px] px-2.5 text-[12px] font-medium transition-colors hover:bg-white/[0.06] short:h-7 short:gap-1 short:rounded-[10px] short:px-2 short:text-[11px]"
              style={{ color: "var(--nav-text-2)" }}
            >
              <ArrowLeft className="h-[14px] w-[14px] short:h-[12px] short:w-[12px]" strokeWidth={2} />
              <span>Exterior</span>
            </button>
          )}
          {/* Expand / shrink — in the title bar so it never overlaps the action
              footer (Start / Teleport) below. */}
          <button
            onClick={toggleFullScreen}
            aria-label={fullScreen ? "Shrink map" : "Expand map"}
            title={fullScreen ? "Shrink to window" : "Expand to full screen"}
            className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] short:h-[26px] short:w-[26px]"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
          >
            {fullScreen ? (
              <Minimize2 className="h-[14px] w-[14px]" strokeWidth={2} color="var(--nav-text-2)" />
            ) : (
              <Maximize2 className="h-[14px] w-[14px]" strokeWidth={2} color="var(--nav-text-2)" />
            )}
          </button>
          {/* Same hairline-circle close as the other overlays (PanelHeader). */}
          <button
            onClick={closeMap}
            aria-label="Close map"
            title="Close map"
            className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] short:h-[26px] short:w-[26px]"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <X size={13} strokeWidth={2} color="var(--nav-text-2)" />
          </button>
        </div>
      </div>

      {/* List-mode (memorial): TWO selector dropdowns side by side above the
          plan — Category and Sub-category (NO "All": the map always shows one
          concrete sub-category) — each an icon-tile pill opening an opaque
          popover list. */}
      {listMode && destCats.length > 0 && (
        <div
          className="relative z-20 flex shrink-0 items-start gap-2 px-3.5 pb-3 short:gap-1.5 short:px-2.5 short:pb-2"
          // Span the plan + the phone side legend so the pills get the full
          // window width (labels show whole, not "L…").
          style={{ width: mapWidth + (sideLegend ? SIDE_LEGEND_W : 0) }}
        >
          {/* Category pill sizes to its CONTENT (labels are short — a fixed
              flex share squeezed "Layouts" into one letter per line); the
              sub-category pill takes whatever width remains. Each pill gets a
              tiny eyebrow heading so it's clear which dropdown is the category
              and which the sub-category. */}
          <div className="max-w-[52%] flex-none">
            <div
              className="nav-body mb-1 pl-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] short:mb-0.5 short:text-[8.5px]"
              style={{ color: "var(--nav-text-2)", opacity: 0.75 }}
            >
              Category
            </div>
            <MapSelect
              icon={destCats.find((c) => c.key === destLabel)?.icon ?? destCats[0].icon}
              items={destCats.map((c) => ({ id: c.key as string, label: c.short, icon: c.icon }))}
              value={destLabel}
              onSelect={(id) => { if (id && id !== destLabel) pickDestLabel(id as DestinationCategory); }}
            />
          </div>
          {mapOptions.length > 1 && (
            <div className="min-w-0 flex-1">
              <div
                className="nav-body mb-1 pl-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] short:mb-0.5 short:text-[8.5px]"
                style={{ color: "var(--nav-text-2)", opacity: 0.75 }}
              >
                Sub category
              </div>
              <MapSelect
                icon={ListFilter}
                items={mapOptions.map((o) => ({ id: o, label: o, icon: iconFor(o) }))}
                value={mapOption}
                onSelect={pickMapOption}
              />
            </div>
          )}
        </div>
      )}

      {/* Crowd Flow: colour legend for the zone overlays drawn on the plan —
          same tiers/colours as the 3D heatmap (red high · yellow med · blue low). */}
      {listMode && destLabel === "crowdflow" && (
        <div
          className="flex shrink-0 items-center gap-3 px-3.5 pb-2 short:gap-2.5 short:px-2.5 short:pb-1.5"
          style={{ width: mapWidth + (sideLegend ? SIDE_LEGEND_W : 0) }}
        >
          {([["#ff453a", "High"], ["#ffd60a", "Moderate"], ["#0a84ff", "Low"]] as const).map(([c, l]) => (
            <span key={l} className="nav-body flex items-center gap-1.5 text-[10.5px] font-semibold short:text-[9.5px]" style={{ color: "var(--nav-text-2)" }}>
              <span aria-hidden className="h-[8px] w-[8px] shrink-0 rounded-[2px]" style={{ background: c, opacity: 0.9 }} />
              {l}
            </span>
          ))}
        </div>
      )}

      {/* Body — floor plan on the left, category radios on the right (classic).
          List-mode insets the plan with the design's curved corners instead. */}
      <div className="flex">
        <div
          className={listMode ? "relative mx-3.5 overflow-hidden rounded-[14px] short:mx-2.5" : "relative"}
          style={listMode ? { width: mapWidth - 28, height: mapHeight } : { width: mapWidth, height: mapHeight }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            style={{ width: "100%", height: "100%", cursor: listMode ? "default" : "crosshair", display: "block" }}
          />

          {/* Back to the terminal framing. Offered only once the view has left
              it, so it does not sit there implying the map is somewhere it
              isn't. List-mode's plan does not pan or zoom, so it never appears. */}
          {!listMode && (
            <button
              onClick={recenter}
              aria-label="Back to the terminal"
              title="Back to the terminal"
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-[opacity,transform] duration-200 hover:bg-white/[0.1] short:bottom-1.5 short:right-1.5 short:h-7 short:w-7"
              style={{
                ...NAV_GLASS_PANEL,
                opacity: drifted ? 1 : 0,
                transform: drifted ? "scale(1)" : "scale(0.85)",
                pointerEvents: drifted ? "auto" : "none",
              }}
            >
              <LocateFixed className="h-[17px] w-[17px] short:h-[14px] short:w-[14px]" strokeWidth={2} color="var(--nav-text)" />
            </button>
          )}
        </div>

        {/* Phone list-mode: destination legend BESIDE the plan — a compact
            side column ("N on map" + numbered rows), scrolling on its own. */}
        {sideLegend && (
          <div className="flex flex-col overflow-hidden pr-2" style={{ width: SIDE_LEGEND_W, height: mapHeight }}>
            {dests.length === 0 ? (
              <div className="nav-body px-1 pt-2 text-[11px]" style={{ color: "var(--nav-text-dim)" }}>
                No data for this category yet
              </div>
            ) : (
              <>
                <div className="nav-body shrink-0 px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--nav-text-dim)" }}>
                  {dests.length} on map
                </div>
                <div data-map-scroll className="ui-scrollbar flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain pb-1.5">
                  {dests.map((d) => {
                    const on = d.id === selectedPoi?.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => (on ? clearDestSelection() : selectMapDestination(d.id, d.x, d.z))}
                        className="flex w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-1.5 py-[5px] text-left transition-colors hover:bg-white/[0.05]"
                        style={on ? { background: "rgba(10,132,255,0.16)" } : undefined}
                      >
                        <span
                          className="nav-display flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold"
                          style={{
                            background: on ? "#0a84ff" : d.here ? "#30d158" : "rgba(255,255,255,0.14)",
                            color: "#ffffff",
                          }}
                        >
                          {d.num}
                        </span>
                        <span className="nav-display min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: "var(--nav-text)" }}>
                          {d.name}
                        </span>
                        {/* Crowd tier — dot + word, exactly like the overlay
                            lists ("● Moderate"); the number chip stays neutral. */}
                        {d.crowd && CROWD_DOT[d.crowd] && (
                          <span className="flex shrink-0 items-center gap-1">
                            <span
                              aria-hidden
                              className="h-[7px] w-[7px] shrink-0 rounded-full"
                              style={{ background: CROWD_DOT[d.crowd], boxShadow: `0 0 4px ${CROWD_DOT[d.crowd]}` }}
                            />
                            <span className="nav-body text-[9px] font-semibold" style={{ color: "var(--nav-text-2)" }}>
                              {CROWD_WORD[d.crowd]}
                            </span>
                          </span>
                        )}
                        <span className="nav-body shrink-0 text-[9.5px] font-semibold" style={{ color: d.here ? "#30d158" : "var(--nav-text-2)" }}>
                          {d.here ? "Here" : d.walkable === false ? "TP" : d.distLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* The category radio column and the hotspot pins are intentionally
            absent: this venue's layouts are aerial framings and its hotspots
            are authored in a different coordinate frame, so neither placed
            meaningfully on the plan. The map is the plan plus your position. */}
      </div>

      {/* Action bar — selected destination + Start / Teleport / Stop. In
          list-mode it sits directly UNDER the plan (design: summary + Go),
          with the destination list below it. */}
      <MapDestinationControls
        isMoving={isMoving}
        onStop={stopNav}
        selected={selectedPoi}
        onStart={startSelectedDest}
        onTeleport={teleportSelectedDest}
        onClear={clearDestSelection}
        ctrlRef={playerControllerRef}
        listMode={listMode}
      />

      {/* List-mode (memorial): destination legend — ties the plan's numbered
          dots to names + distances. Tapping a row selects that destination
          (map click-to-walk is disabled on this venue). The row of the destination the
          player is standing at reads "Here" in green. */}
      {/* Sub-category picked but nothing authored for it yet (no camera/hotspot
          data delivered) → keep the dropdown entry, show a "no data" line where
          the destination legend would be. */}
      {listMode && !sideLegend && destLabel && dests.length === 0 && (
        <div className="nav-body px-3.5 pb-3 pt-1 text-center text-[12px]" style={{ color: "var(--nav-text-dim)" }}>
          No data for this category yet
        </div>
      )}
      {listMode && !sideLegend && dests.length > 0 && (
        <div>
          <div
            className="nav-body px-3.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--nav-text-dim)" }}
          >
            {dests.length} on map
          </div>
          <div className="ui-scrollbar flex max-h-[150px] flex-col gap-px overflow-y-auto overscroll-contain px-2 pb-2.5 short:max-h-[68px]">
            {dests.map((d) => {
              const on = d.id === selectedPoi?.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => (on ? clearDestSelection() : selectMapDestination(d.id, d.x, d.z))}
                  className="flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-[11px] px-2.5 py-[7px] text-left transition-colors hover:bg-white/[0.05]"
                  style={on ? { background: "rgba(10,132,255,0.16)" } : undefined}
                >
                  <span
                    className="nav-display flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      background: on ? "#0a84ff" : d.here ? "#30d158" : "rgba(255,255,255,0.14)",
                      color: "#ffffff",
                    }}
                  >
                    {d.num}
                  </span>
                  <span className="nav-display min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--nav-text)" }}>
                    {d.name}
                  </span>
                  {/* Crowd tier — dot + word, exactly like the overlay lists
                      ("● Moderate"); the number chip stays neutral. */}
                  {d.crowd && CROWD_DOT[d.crowd] && (
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        aria-hidden
                        className="h-[8px] w-[8px] shrink-0 rounded-full"
                        style={{ background: CROWD_DOT[d.crowd], boxShadow: `0 0 4px ${CROWD_DOT[d.crowd]}` }}
                      />
                      <span className="nav-body text-[10px] font-semibold" style={{ color: "var(--nav-text-2)" }}>
                        {CROWD_WORD[d.crowd]}
                      </span>
                    </span>
                  )}
                  <span className="nav-body shrink-0 text-[11.5px] font-semibold" style={{ color: d.here ? "#30d158" : "var(--nav-text-2)" }}>
                    {d.here ? "Here" : d.walkable === false ? "Teleport" : d.distLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
