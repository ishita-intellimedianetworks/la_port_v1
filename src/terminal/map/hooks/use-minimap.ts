"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useScene } from "../../context/scene-context";
import {
  ZOOM_FACTOR, ZOOM_IN_LIMIT, ZOOM_OUT_MARGIN,
  MAP_WINDOW_DEFAULT, MAP_FULL_INSET_X, MAP_FULL_CHROME_Y, SIDE_LEGEND_W,
} from "../utils/constants";
import { SHORT_MEDIA_QUERY } from "@/shared/responsive";
import { pixelToWorld, worldToPixel } from "../utils/coord-utils";
import {
  drawPath,
  drawPlayerFOV, drawClickMarker,
  drawStickers, drawHotspots,
  type MapHotspot,
} from "../utils/draw";
import {
  bakeDimmed, clampPoint, clampView, contains, fitMpp, fitView, hasDrifted,
  plainRect, viewBounds, zoomAt,
  type View, type WorldRect,
} from "../utils/view";
import { scene as siteScene } from "@/config";
import { etaSeconds, fmtEta, fmtMeters } from "../../overlay/nav-hud/format";
import { navConfig } from "../../navigation-config";
/** Congestion tiers -> colour. Inlined when the 3D crowd-flow mesh was removed;
 *  the map still knows how to tint zones if a venue ever supplies them. */
const CROWD_FLOW_COLOR: Record<"low" | "med" | "high", string> = {
  high: "#ff453a",
  med: "#ffd60a",
  low: "#0a84ff",
};
import { CROWD_DOT } from "../../overlay/destination-panel/destination-card";
import { DEST_CATEGORIES } from "../../overlay/destination-panel/category-meta";
import { useNavUiStore } from "../../stores/nav-ui-store";
import type { DestinationCategory } from "@/shared/types";
import type { MinimapData } from "../types";

/** A label destination shown on the map, with its live distance/ETA from the player. */
export interface MapDestination {
  id: string;
  name: string;
  x: number;
  z: number;
  distLabel: string;
  etaLabel: string;
  /** First pin of its destination (carries the name pill; secondary pins are dot-only). */
  labeled?: boolean;
  /** List-mode (memorial): destination number shared by the map dot and its
   *  row in the destination list. */
  num?: number;
  /** The player is standing at this destination → green "You're here" treatment. */
  here?: boolean;
  /** Category-specific info line (campus vs restaurant / sports included /
   *  which stadium a hub serves + accessibility). */
  detail: string;
  /** Whether you can actually travel there (false = hub only serves a
   *  not-accessible destination → no Start/Teleport). */
  accessible: boolean;
  /** A navmesh route to this destination exists (distance measured). False →
   *  the footer offers Teleport only (off-mesh spots). */
  walkable?: boolean;
  /** Authored crowd tier (memorial gates) — heat-map tints the map dot + row chip. */
  crowd?: string;
}

// Fixed, small player/path/ripple size on the full-screen map (Google-Maps
// style). The original small panel used scale 1 (= DEFAULT_MAP_SIZE); we keep
// the marker near that regardless of the now full-viewport canvas.
const MARKER_SCALE = 1.25;

export function useMinimap() {
  const { playerControllerRef, minimapData, navigateFromMinimap, activeFloor, isMoving, triggerFloorTransition, layoutsOpen, setLayoutsOpen, fovOpen, setFovOpen } = useScene();

  const stopNav = useCallback(() => playerControllerRef.current?.stopNavigation(), [playerControllerRef]);

  // ── destination label hotspots on the map ──────────────────────────────────────────
  // `destLabel` = the label whose destinations are shown (null = none).
  // `selectedDestId` = a tapped hotspot → preview route + info card + Start.
  // Seat views are intentionally NOT a map category: they're a teleport-only
  // "view simulation" (no walking route), driven solely by the seat-map panel.
  // Seat views are a teleport-only view simulation and Event Updates is a
  // notice board — neither is a map category.
  const destCats = DEST_CATEGORIES.filter(
    (c) => c.key !== "seatviews" && c.key !== "eventupdates" && (activeFloor?.dests?.[c.key]?.length ?? 0) > 0,
  );
  // Open label + selected destination come from the shared nav store, so the
  // map, the 3D panel, and the dock all stay in sync.
  const destLabel = useNavUiStore((s) => s.openLabel);
  const selectedDestId = useNavUiStore((s) => s.selectedId);
  // destination the player is physically standing at → "You're here" (green) on the
  // plan dot + the destination list row.
  const currentDestId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const currentDestCat = useNavUiStore((s) => s.currentDest?.category ?? null);
  // Standing at an authored teleport-only spot (Level 3 seat, concession
  // stand) → walking OUT is impossible: every map destination is
  // teleport-only until the player teleports away.
  const atTeleportOnly = (() => {
    if (!currentDestId || !currentDestCat) return false;
    const d = activeFloor?.dests?.[currentDestCat]?.find((x) => x.id === currentDestId);
    return !!d?.teleportOnly;
  })();
  // Compact list design (memorial) vs classic labelled-hotspot map (village).
  const listMode = !!activeFloor?.mapListMode;
  // Sub-category (Destination.option) filter for the shown label — null = All. Backed
  // by the SHARED per-category memory (nav store), so the map and the panel
  // agree, and reopening a category after arriving keeps the same sub-list.
  const optionByCat = useNavUiStore((s) => s.optionByCat);
  const setOptionForCat = useNavUiStore((s) => s.setOptionForCat);
  const mapOptions = useMemo(() => {
    const list = destLabel ? activeFloor?.dests?.[destLabel] ?? [] : [];
    return Array.from(new Set(list.map((p) => p.option).filter(Boolean) as string[]));
  }, [destLabel, activeFloor]);
  const storedOpt = destLabel ? optionByCat[destLabel] ?? null : null;
  // No "All" on the map — default to the FIRST sub-category when nothing is
  // remembered (or the memory points at an option this category doesn't have).
  const mapOption = storedOpt && mapOptions.includes(storedOpt) ? storedOpt : mapOptions[0] ?? null;
  const setSelectedDestId = useNavUiStore((s) => s.setSelectedId);
  const toggleLabel = useNavUiStore((s) => s.toggleLabel);
  const closePanel = useNavUiStore((s) => s.closePanel);
  // The map open/close flag lives in the shared store so the left sidebar's Map
  // button can open the same full-screen overlay this hook renders.
  const expanded = useNavUiStore((s) => s.mapExpanded);
  const setMapExpanded = useNavUiStore((s) => s.setMapExpanded);
  const [mapDests, setMapDestinations] = useState<MapDestination[]>([]);
  // Refs the RAF draw loop reads (so selection/label changes don't re-arm it).
  const destLabelRef = useRef<DestinationCategory | null>(null);
  const selectedDestIdRef = useRef<string | null>(null);
  const hotspotsRef = useRef<MapHotspot[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** World-space; a canvas-space ripple would stay put while the map moved. */
  const clickMarkerRef = useRef<{ x: number; z: number; alpha: number } | null>(null);
  /** Pulses the zone outline when a click lands outside it. */
  const rejectRef = useRef(0);

  const planRef = useRef<HTMLImageElement | null>(null);
  const planDimRef = useRef<HTMLCanvasElement | null>(null);
  const siteDimRef = useRef<HTMLCanvasElement | null>(null);

  // The RAF loop reads these directly, so pan/zoom never re-renders React.
  const viewRef = useRef<View>({ cx: 0, cz: 0, mpp: 1 });
  const homeRef = useRef<View>({ cx: 0, cz: 0, mpp: 1 });
  const mppLimitsRef = useRef({ min: 0.01, max: 100 });
  const tweenRef = useRef(0);
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, cx: 0, cz: 0 });
  // Kept for the click/pan guards; always false now that drag-resize is gone.
  const resizingRef = useRef(false);
  /** Drives the recenter button. Ref-guarded so a settled view doesn't
   *  dispatch every frame. */
  const [drifted, setDrifted] = useState(false);
  const driftedRef = useRef(false);
  const siteBoundsRef = useRef<MinimapData["bounds"] | null>(null);

  // Always-current canvas size for event handlers (avoids stale closure)
  const mapSizeRef = useRef({ w: 0, h: 0 });

  // Canvas dimensions — driven by the small/full toggle (no free drag-resize).
  const [mapDims, setMapDims] = useState({ w: MAP_WINDOW_DEFAULT.w, h: MAP_WINDOW_DEFAULT.h });
  // Small floating window vs. full-screen (fills the viewport beside the sidebar).
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullScreen = useCallback(() => setFullScreen((v) => !v), []);
  // Width (px) of the right-hand category-radio column (20% of the window; the
  // canvas takes the other 80%).
  const [radioWidth, setRadioWidth] = useState(0);

  // Collapse minimap when layouts panel or FOV opens
  useEffect(() => {
    if (layoutsOpen || fovOpen) setMapExpanded(false);
  }, [layoutsOpen, fovOpen, setMapExpanded]);

  // Thin toggle — flips the shared flag. The open/close side-effects live in the
  // transition effect below so they run no matter who flipped it (this toggle OR
  // the left sidebar's Map button writing the store directly).
  const toggleExpanded = useCallback(() => setMapExpanded(!expanded), [expanded, setMapExpanded]);

  // Explicit "close the map to nothing" (the X button): close it AND clear the
  // open label/selection/preview so the dock is clean. Kept separate from the
  // open/close effect below so that closing the map by picking ANOTHER category
  // (which sets a new openLabel) doesn't get that label wiped.
  const closeMap = useCallback(() => {
    setMapExpanded(false);
    closePanel();
    playerControllerRef.current?.clearPreview();
  }, [setMapExpanded, closePanel, playerControllerRef]);

  // Remember the last category shown on the map. Arriving at a destination
  // closes the panel and clears openLabel — without this memory, reopening
  // the map always deselected back to the default category.
  const lastLabelRef = useRef<DestinationCategory | null>(null);
  useEffect(() => { if (destLabel) lastLabelRef.current = destLabel; }, [destLabel]);

  // Side-effects on every open/close transition. The effect may re-run on other
  // dep changes (destCats is a fresh array each render), but the prevExpandedRef
  // guard makes it a no-op unless `expanded` actually flipped.
  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    if (expanded === prevExpandedRef.current) return;
    prevExpandedRef.current = expanded;
    if (expanded) {
      setLayoutsOpen(false);
      setFovOpen(false);
      // List-mode (memorial): the map re-opens on the REMEMBERED category
      // (whatever was last shown on the map / panel), falling back to Layouts
      // only on the very first open. The sub-category keeps its REMEMBERED
      // value too (optionByCat, shared with the panel).
      if (listMode) {
        const fallback: DestinationCategory | undefined =
          (activeFloor?.dests?.layouts?.length ?? 0) > 0 ? "layouts" : destCats[0]?.key;
        const want = destLabel ?? lastLabelRef.current ?? fallback;
        if (want && destLabel !== want) toggleLabel(want);
      } else if (!destLabel && destCats[0]) {
        // Classic: if no category is active yet, open the first one so its
        // hotspots are visible immediately on the map.
        toggleLabel(destCats[0].key);
      }
    } else {
      // Closing → only drop the preview route. We deliberately DON'T clear the
      // open label here: closing the map by picking another category must keep
      // that category open (the explicit X button clears via closeMap()).
      playerControllerRef.current?.clearPreview();
    }
  }, [expanded, destLabel, destCats, toggleLabel, setLayoutsOpen, setFovOpen, playerControllerRef, listMode, activeFloor]);

  // ── destination hotspots: compute, select, start ───────────────────────────────────
  // Recompute each hotspot's live distance/ETA from the player's current
  // position (navmesh path × the shared display scale).
  const computeHotspots = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const all = destLabel && destLabel !== "seatviews" ? (activeFloor?.dests?.[destLabel] ?? []) : [];
    // Sub-category filter (map-side "show sub-categories wise") — null = All.
    const list = mapOption ? all.filter((p) => (p.option ?? "") === mapOption) : all;
    const dests = activeFloor?.transportDestinations ?? [];
    const mpu = navConfig.logic.displayMetersPerUnit;
    const next: MapDestination[] = list.flatMap((dest, destIdx) => {
      // A destination = ONE camera + 0..N hotspots. Every hotspot draws a pin
      // (all sharing the destination's number); no hotspots → one pin at the
      // camera. The walk + distance/ETA always target the CAMERA, so the map
      // matches the panel.
      const cam = dest.camera?.position;
      const fallbackPin = dest.hotspot?.position ?? cam;
      const pins: [number, number, number][] = dest.hotspots?.length
        ? dest.hotspots.map((h) => h.position)
        : fallbackPin
          ? [fallbackPin]
          : [];
      // Teleport-only destinations (authored flag) have no walking route —
      // and neither does anything when standing AT a teleport-only spot.
      const walkAllowed = !!cam && !dest.teleportOnly && !atTeleportOnly;
      const wu = walkAllowed && cam ? ctrl?.measurePathTo({ x: cam[0], eyeY: cam[1], z: cam[2] }) ?? null : null;
      // Category-specific info: dining campus/restaurant, practice sports
      // included, or which stadium a transit hub serves + accessibility.
      let detail = "";
      let accessible = true;
      if (destLabel === "restaurants") {
        detail = dest.kind === "campus" ? "Campus dining" : "Restaurant";
      } else if (destLabel === "practice") {
        detail = (dest.sports ?? []).join(" · ");
      } else if (destLabel === "transport") {
        const served = dests.filter((d) => d.hubId === dest.id);
        detail = served.length
          ? served
              .map((d) => `${d.label} · ${d.accessible === false ? "not accessible" : "accessible"}`)
              .join("  ·  ")
          : "Transit hub";
        // A hub is reachable only if it serves at least one accessible venue.
        accessible = served.length === 0 || served.some((d) => d.accessible !== false);
      }
      return pins.map((hs, i) => ({
        // Practice hotspots always read "Practice" on the map (not the venue /
        // stadium name); the venue + sports show in the detail line.
        id: dest.id, name: destLabel === "practice" ? "Practice" : dest.label, x: hs[0], z: hs[2],
        distLabel: wu == null ? "—" : fmtMeters(wu * mpu),
        etaLabel: wu == null ? "" : fmtEta(etaSeconds(wu, mpu)),
        detail: destLabel === "practice" ? [dest.label, detail].filter(Boolean).join(" · ") : detail,
        accessible,
        // Classic design: only the first pin carries the name pill.
        labeled: i === 0,
        // List-mode: every pin of a destination shares its list-row number.
        num: destIdx + 1,
        here: dest.id === currentDestId,
        walkable: wu != null,
        crowd: dest.crowd,
      }));
    });
    setMapDestinations(next);
  }, [destLabel, mapOption, activeFloor, playerControllerRef, currentDestId, atTeleportOnly]);

  // Mirror state into the refs the RAF draw loop reads.
  const listModeRef = useRef(listMode);
  useEffect(() => { listModeRef.current = listMode; }, [listMode]);
  useEffect(() => { destLabelRef.current = destLabel; }, [destLabel]);
  useEffect(() => { selectedDestIdRef.current = selectedDestId; }, [selectedDestId]);
  useEffect(() => {
    hotspotsRef.current = mapDests.map((p) => ({
      id: p.id, name: p.name, x: p.x, z: p.z, distLabel: p.distLabel, labeled: p.labeled, num: p.num, here: p.here,
      crowdColor: p.crowd ? CROWD_DOT[p.crowd] : undefined,
    }));
  }, [mapDests]);

  // Recompute distances when the label changes or the map (re)opens. Deferred
  // one frame: the recompute is a synchronous A* sweep over every destination,
  // and running it inside the click's render blocked the dropdown/selection
  // from painting (the UI read as stuck).
  useEffect(() => {
    const raf = requestAnimationFrame(() => computeHotspots());
    return () => cancelAnimationFrame(raf);
  }, [computeHotspots, expanded]);

  const clearDestSelection = useCallback(() => {
    setSelectedDestId(null);
    playerControllerRef.current?.clearPreview();
  }, [setSelectedDestId, playerControllerRef]);

  // Radio toggle: pick a label (switching drops any selection), or unpick to hide.
  const pickDestLabel = useCallback((key: DestinationCategory) => {
    playerControllerRef.current?.clearPreview();
    toggleLabel(key);
  }, [playerControllerRef, toggleLabel]);

  // Sub-category dropdown under the active label — writes the shared memory
  // and drops any selection (the selected pin may no longer be shown).
  const pickMapOption = useCallback((o: string | null) => {
    if (destLabel) setOptionForCat(destLabel, o);
    clearDestSelection();
  }, [destLabel, setOptionForCat, clearDestSelection]);

  // Tap a hotspot → preview its route (no walking yet). The pin sits at the
  // hotspot, but the route always targets the destination's camera (where you walk to,
  // facing the hotspot) — fall back to the tapped point if the destination is missing.
  const selectMapDestination = useCallback((id: string, x: number, z: number) => {
    setSelectedDestId(id);
    const dest = (destLabel ? activeFloor?.dests?.[destLabel] ?? [] : []).find((p) => p.id === id);
    // Teleport-only destination or teleport-only standing spot → no walkable
    // route to preview.
    if (dest?.teleportOnly || atTeleportOnly) { playerControllerRef.current?.clearPreview(); return; }
    const cam = dest?.camera?.position;
    const tx = cam ? cam[0] : x;
    const tz = cam ? cam[2] : z;
    // Defer the synchronous A* preview one frame so the row/pin highlight
    // paints before the pathfind runs (same pattern as the panel select).
    requestAnimationFrame(() => {
      if (useNavUiStore.getState().selectedId !== id) return;
      // eyeY (when the destination has an authored camera) pins the preview
      // route to the destination's LEVEL on multi-level venues.
      const ok = playerControllerRef.current?.previewTo(
        cam ? { x: tx, eyeY: cam[1], z: tz } : { x: tx, z: tz },
      );
      if (!ok) playerControllerRef.current?.clearPreview();
    });
  }, [setSelectedDestId, playerControllerRef, destLabel, activeFloor, atTeleportOnly]);

  // Start: walk to the selected hotspot (snaps to navmesh, like a map click).
  // On arrival, settle into the destination's authored pose (exact spot + facing) so the
  // walk ends framed on the building, matching the teleport view.
  const startSelectedDest = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const full = (destLabel ? activeFloor?.dests?.[destLabel] ?? [] : []).find((p) => p.id === selectedDestId);
    const cam = full?.camera;
    // Teleport-only destinations, or starting FROM a teleport-only spot —
    // walking is never offered.
    if (!ctrl || !full || !cam || full.teleportOnly || atTeleportOnly) return;
    const x = cam.position[0];
    const z = cam.position[2];
    ctrl.clearPreview();
    setSelectedDestId(null);
    navigateFromMinimap(x, z);
    // This walk targets a LABEL destination (a tapped hotspot) → show the turn
    // HUD. Must run AFTER navigateFromMinimap, which routes through navigateToFloor
    // and defaults the flag to false for plain map clicks.
    useNavUiStore.getState().setNavHud(true);
    ctrl.setOnNavigationComplete(() => {
      // Exact-pose destination → settle into the authored pose; ground
      // destinations snap to the navmesh probed at the AUTHORED height (same
      // policy as every teleport, so arrival Y matches).
      const eyeY = cam.position[1];
      const ch = ctrl.getPosition().y - ctrl.getFootPosition().y;
      const footGuess = eyeY ? eyeY - ch : 0;
      const y = full.exactPose && eyeY ? eyeY - ch : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;
      ctrl.teleportTo([x, y, z], cam.rotation, true);
      // Latch "currently at" immediately on arrival (don't wait for the poll).
      if (destLabel) {
        useNavUiStore.getState().setCurrentDest({ id: full.id, label: full.label, category: destLabel, option: full.option });
      }
    });
  }, [playerControllerRef, destLabel, activeFloor, selectedDestId, setSelectedDestId, navigateFromMinimap, atTeleportOnly]);

  // Teleport: close the map, then fade out → jump the camera to the destination's pose
  // → fade in. Needs the full destination for its authored rotation.
  const teleportSelectedDest = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const dest = (destLabel ? activeFloor?.dests?.[destLabel] ?? [] : []).find((p) => p.id === selectedDestId);
    const cam = dest?.camera;
    if (!ctrl || !dest || !cam) return;
    setMapExpanded(false);
    closePanel();
    ctrl.clearPreview();
    triggerFloorTransition(() => {
      const x = cam.position[0];
      const z = cam.position[2];
      const eyeY = cam.position[1];
      // Exact-pose destinations (seat views) keep the authored eye Y
      // (teleportTo re-adds the camera height); ground destinations snap to
      // the navmesh probed at the AUTHORED height — same policy as the panel
      // teleport, so both land at the identical Y (expectedY=0 snapped
      // Level-3 gates to the ground level below them).
      const ch = ctrl.getPosition().y - ctrl.getFootPosition().y;
      const footGuess = eyeY ? eyeY - ch : 0;
      const y = dest.exactPose && eyeY ? eyeY - ch : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;
      ctrl.teleportTo([x, y, z], cam.rotation);
      // Latch "currently at" IMMEDIATELY — waiting for the 200ms position poll
      // made the arrival UI (hotspot markers, "You're here") appear late.
      if (destLabel) {
        useNavUiStore.getState().setCurrentDest({ id: dest.id, label: dest.label, category: destLabel, option: dest.option });
      }
    });
  }, [playerControllerRef, destLabel, activeFloor, selectedDestId, closePanel, triggerFloorTransition, setMapExpanded]);

  const mapWidth  = mapDims.w;
  const mapHeight = mapDims.h;
  // Sync mapSizeRef after render so event handlers always read the latest size
  useLayoutEffect(() => {
    mapSizeRef.current = { w: mapWidth, h: mapHeight };
  }, [mapWidth, mapHeight]);

  // Nested rects: zone inside plan inside site. Opens on `zone`, and only
  // `zone` takes clicks.
  const mapCfg = siteScene.map;

  /** `map.plan` stores the image and the rect it was rendered to together, so
   *  the render can come from any GLB. minimapData is the legacy fallback. */
  const planLayer = useMemo(() => {
    if (mapCfg?.plan) return { url: mapCfg.plan.imageUrl, bounds: mapCfg.plan.bounds };
    return minimapData ? { url: minimapData.imageUrl, bounds: minimapData.bounds } : null;
  }, [mapCfg, minimapData]);
  const planUrl = planLayer?.url;

  const planRect: WorldRect | null = useMemo(
    () => (planLayer ? plainRect(planLayer.bounds) : null),
    [planLayer],
  );

  /** Decoration only. */
  const siteRect: WorldRect | null = useMemo(
    () => (mapCfg?.site ? plainRect(mapCfg.site.bounds) : null),
    [mapCfg],
  );

  /** Where walking works. Defaults to the plan's extent when unauthored. */
  const zoneRect: WorldRect | null = useMemo(
    () => mapCfg?.zone ?? planRect,
    [mapCfg, planRect],
  );

  /** Bounds the pan clamp and the zoom-out limit. */
  const outerRect = siteRect ?? planRect ?? zoneRect;

  // The pointer handlers bind once, so they read these through refs.
  const outerRectRef = useRef<WorldRect | null>(null);
  useEffect(() => { outerRectRef.current = outerRect; }, [outerRect]);
  const zoneRectRef = useRef<WorldRect | null>(null);
  useEffect(() => { zoneRectRef.current = zoneRect; }, [zoneRect]);
  useEffect(() => { siteBoundsRef.current = mapCfg?.site?.bounds ?? null; }, [mapCfg]);

  // A view still at home follows a resize; one the user moved is left alone.
  useEffect(() => {
    const W = mapWidth;
    const H = mapHeight;
    if (!zoneRect || W <= 0 || H <= 0) return;

    const home = fitView(zoneRect, W, H);
    const outMost = outerRect ? fitMpp(outerRect, W, H) * ZOOM_OUT_MARGIN : home.mpp;
    // A zone bigger than its container would otherwise pin min above max.
    const max = Math.max(outMost, home.mpp);
    const min = Math.min(home.mpp / ZOOM_IN_LIMIT, max);

    const wasHome = !hasDrifted(viewRef.current, homeRef.current);
    homeRef.current = home;
    mppLimitsRef.current = { min, max };
    if (wasHome) viewRef.current = { ...home };
    else viewRef.current = { ...viewRef.current, mpp: Math.min(max, Math.max(min, viewRef.current.mpp)) };
  }, [mapWidth, mapHeight, zoneRect, outerRect]);

  // A new plan makes the old view meaningless.
  useEffect(() => {
    viewRef.current = { ...homeRef.current };
  }, [planUrl]);

  // Canvas size: a fixed small window or full-screen (fills the viewport beside
  // the left sidebar). Recomputed on viewport resize. The canvas is no longer
  // drag-resizable — the user flips between the two sizes with the title button.
  // The radio column auto-sizes to the WIDEST category label (single line, no
  // wrap); the canvas takes the rest. Keyed by the label set so it re-measures
  // per floor. Toggling small↔full TWEENS the canvas dims so the resize glides.
  const radioKey = destCats.map((c) => c.short).join("|");
  const tweenRaf = useRef(0);
  const sizedOnce = useRef(false);
  useEffect(() => {
    const targetDims = () => {
      // Landscape-phone viewport: a slimmer left rail + tighter chrome, and a
      // smaller default window so the whole thing fits on screen.
      const short = window.matchMedia(SHORT_MEDIA_QUERY).matches;
      const insetX = short ? 72 : MAP_FULL_INSET_X;   // left rail + side margins
      // List-mode (memorial) adds the selector row above the plan AND the
      // destination list below it → the chrome is taller. On phones the
      // legend sits BESIDE the plan, so the vertical chrome is just the
      // selector (~40) + footer (~44).
      const listChrome = listMode ? (short ? 95 : 215) : 0;
      // Full-screen must fill the WHOLE viewport: the floating-window estimate
      // reserves generous outer margins that made the "full" canvas barely
      // half the phone screen. Full-screen keeps only the title bar + a hair
      // of breathing room.
      const baseChrome = fullScreen ? (short ? 58 : 104) : short ? 118 : MAP_FULL_CHROME_Y;
      const chromeY = baseChrome + listChrome;
      const defW = (short ? 320 : MAP_WINDOW_DEFAULT.w) + (listMode ? 60 : 0);
      const defH = short ? 200 : MAP_WINDOW_DEFAULT.h;
      // TRUE available space (only a tiny absolute floor so it never collapses).
      // Crucially we do NOT force a comfortable minimum above what the viewport
      // can show — that was making the window overflow short phones.
      // Phone list-mode puts the legend BESIDE the plan — reserve its width so
      // the window (canvas + legend) never runs off the right edge, especially
      // in full-screen. The plan then simply fills whatever width remains.
      const sideLegendW = listMode && short ? SIDE_LEGEND_W : 0;
      const availW = Math.max(200, window.innerWidth - insetX - sideLegendW);
      const availH = Math.max(150, window.innerHeight - chromeY);
      let winW = fullScreen ? availW : Math.min(defW, availW);
      const winH = fullScreen ? availH : Math.min(defH, availH);
      // PHONE list-mode small window: the floor plan is SQUARE — a window
      // wider than the plan's height just letterboxes empty bands either side
      // of the image. Clamp the width to the plan height (+ the 28px canvas
      // inset) so the image fills. Phones only: on desktop the clamp squeezed
      // the window to ~290px and wrapped the dropdown labels; and full-screen
      // must actually expand to the viewport.
      if (listMode && short && !fullScreen) winW = Math.min(winW, winH + 28);
      // Measure the widest label so the column fits the whole text on one line.
      let maxText = 0;
      const cv = document.createElement("canvas");
      const cx = cv.getContext("2d");
      if (cx) {
        cx.font = "600 11.5px system-ui, -apple-system, sans-serif";
        for (const s of radioKey.split("|")) if (s) maxText = Math.max(maxText, cx.measureText(s).width);
      }
      // text + dot + gap + button padding + column padding + a little slack.
      // Fit the widest label, but never let the column exceed ~42% of the window
      // (keeps the map readable on a narrow phone). List-mode has NO side
      // column — its categories live in the selector controls above the plan.
      const radioW = radioKey && !listMode ? Math.min(Math.ceil(maxText) + 52, Math.round(winW * 0.42)) : 0;
      return { w: Math.max(140, winW - radioW), h: winH, radioW };
    };

    // All setState routed through these helpers (not the effect body directly)
    // so a synchronous size update doesn't trip react-hooks/set-state-in-effect.
    const commitSize = (w: number, h: number) => {
      mapSizeRef.current = { w, h };
      setMapDims({ w, h });
    };
    const commitRadio = (w: number) => setRadioWidth(w);

    const t = targetDims();
    commitRadio(t.radioW); // column width is mode-independent → never tween it

    if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    if (!sizedOnce.current) {
      // First sizing (map open) → snap, no animation.
      sizedOnce.current = true;
      commitSize(t.w, t.h);
    } else {
      // small↔full toggle (or floor change) → ease the canvas to its new size.
      const from = { ...mapSizeRef.current };
      const to = { w: t.w, h: t.h };
      const DUR = 320;
      let start = 0;
      const step = (ts: number) => {
        if (!start) start = ts;
        const k = Math.min(1, (ts - start) / DUR);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        commitSize(Math.round(from.w + (to.w - from.w) * e), Math.round(from.h + (to.h - from.h) * e));
        if (k < 1) tweenRaf.current = requestAnimationFrame(step);
      };
      tweenRaf.current = requestAnimationFrame(step);
    }

    // Window resize snaps (no animation) to avoid lag while dragging the window.
    const onResize = () => {
      if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
      const r = targetDims();
      commitSize(r.w, r.h);
      commitRadio(r.radioW);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    };
  }, [fullScreen, radioKey, listMode]);

  // Load floor plan image — keep previous image visible until new one loads,
  // so the keyed slide-in animation on the wrapper has something to draw
  // through the whole 500ms in-animation.
  useEffect(() => {
    if (!planUrl) return;
    const img = new Image();
    img.onload = () => {
      planRef.current = img;
      planDimRef.current = bakeDimmed(img, 0.55);
    };
    img.src = planUrl;
  }, [planUrl]);

  const siteUrl = mapCfg?.site?.imageUrl;
  useEffect(() => {
    if (!siteUrl) return;
    const img = new Image();
    img.onload = () => { siteDimRef.current = bakeDimmed(img, 0.42); };
    img.src = siteUrl;
  }, [siteUrl]);

  // ── Wheel zoom + drag pan + pinch zoom ────────────────────────────────────
  // All attached as imperative listeners so we can call preventDefault.
  //
  // The canvas in the JSX is keyed by the floor-plan URL so the slide-in
  // animation can re-fire on every floor swap — which means React unmounts
  // the old <canvas> and mounts a brand-new one whenever the active floor
  // changes. The effect must therefore re-run on URL change too: with only
  // `[clampOffset]` (stable) in the deps, listeners only ever bound to the
  // very first canvas, and zoom/pan stopped working after the first floor.
  // Adding the URL forces a re-bind on the new canvas; the cleanup detaches
  // listeners from the old (now-orphaned) one harmlessly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A wheel factor > 1 zooms IN, i.e. a SMALLER mpp - hence the reciprocal.
    const applyZoom = (factor: number, cx: number, cy: number) => {
      const { w: W, h: H } = mapSizeRef.current;
      const { min, max } = mppLimitsRef.current;
      const next = zoomAt(viewRef.current, 1 / factor, cx, cy, W, H, min, max);
      const limit = outerRectRef.current;
      viewRef.current = limit ? clampView(next, limit) : next;
    };

    // Map a client-space point to canvas-space (matches the visual size).
    const clientToCanvas = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { w: W, h: H } = mapSizeRef.current;
      return {
        cx: ((clientX - rect.left) / rect.width) * W,
        cy: ((clientY - rect.top) / rect.height) * H,
      };
    };

    // ─ Mouse wheel ───────────────────────────────────────────────────────
    // Normalize deltaY across browsers/devices. Pixel mode is the common
    // case (trackpads). Some old browsers/mice report in lines or pages —
    // map those to a reasonable pixel-equivalent so a single notch zooms
    // by ~one factor step instead of a wild swing or nothing at all.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;       // lines → px
      else if (e.deltaMode === 2) dy *= 100; // pages → px
      // Map dy magnitude to a smooth multiplicative factor. Capped at one
      // ZOOM_FACTOR per event so very large trackpad deltas don't blow past
      // MAX_ZOOM in a single tick.
      const stepK = Math.min(1, Math.abs(dy) / 100);
      const factor = dy < 0
        ? 1 + (ZOOM_FACTOR - 1) * stepK
        : 1 / (1 + (ZOOM_FACTOR - 1) * stepK);
      const { cx, cy } = clientToCanvas(e.clientX, e.clientY);
      applyZoom(factor, cx, cy);
    };

    // ─ Mouse drag ────────────────────────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || resizingRef.current) return;
      dragRef.current = {
        active: true,
        moved: false,
        sx: e.clientX,
        sy: e.clientY,
        cx: viewRef.current.cx,
        cz: viewRef.current.cz,
      };
      // List-mode plan is non-interactive → keep the plain cursor.
      if (!listModeRef.current) canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
      if (!d.moved) return;
      // Canvas X grows as world X shrinks (the +Z-up flip), so dragging right
      // must INCREASE the world centre for the content to follow the pointer.
      const { mpp } = viewRef.current;
      const next = { ...viewRef.current, cx: d.cx + dx * mpp, cz: d.cz + dy * mpp };
      const limit = outerRectRef.current;
      viewRef.current = limit ? clampView(next, limit) : next;
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
      canvas.style.cursor = listModeRef.current ? "default" : "crosshair";
    };

    // ─ Touch — single-finger pan + two-finger pinch zoom ─────────────────
    // Mobile had no zoom path at all (no wheel event on touch devices). The
    // pinch handler tracks the distance between two fingers and feeds the
    // ratio into applyZoom() centered on the midpoint.
    type TouchState = {
      startDist: number;
      startMpp: number;
      midX: number;
      midY: number;
      panActive: boolean;
      panSX: number;
      panSY: number;
      panCX: number;
      panCZ: number;
    };
    const touch: TouchState = {
      startDist: 0,
      startMpp: 1,
      midX: 0,
      midY: 0,
      panActive: false,
      panSX: 0,
      panSY: 0,
      panCX: 0,
      panCZ: 0,
    };

    // Touch movement threshold (px). Anything below this is treated as a tap,
    // not a drag — without it, finger jitter on a tap shifted the canvas pan,
    // which on mobile pushed click coordinates off by ~5-10 px (≈ 1-2 m world
    // on the 170 px minimap) and made tap-on-sticker land outside the stair
    // lookAt radius. Matches the 4 px threshold the mouse drag already uses;
    // bumped to 5 to be a bit more touch-forgiving.
    const TOUCH_PAN_THRESHOLD = 5;

    const onTouchStart = (e: TouchEvent) => {
      if (resizingRef.current) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        touch.startDist = Math.sqrt(dx * dx + dy * dy);
        touch.startMpp = viewRef.current.mpp;
        const mid = clientToCanvas((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
        touch.midX = mid.cx;
        touch.midY = mid.cy;
        touch.panActive = false;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touch.panActive = true;
        touch.panSX = t.clientX;
        touch.panSY = t.clientY;
        touch.panCX = viewRef.current.cx;
        touch.panCZ = viewRef.current.cz;
        // Reset the moved flag so handleClick won't think this tap is a drag.
        dragRef.current.moved = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touch.startDist > 0) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return;
        const targetMpp = touch.startMpp * (touch.startDist / dist);
        applyZoom(viewRef.current.mpp / targetMpp, touch.midX, touch.midY);
      } else if (e.touches.length === 1 && touch.panActive) {
        const t = e.touches[0];
        const dx = t.clientX - touch.panSX;
        const dy = t.clientY - touch.panSY;
        if (Math.abs(dx) > TOUCH_PAN_THRESHOLD || Math.abs(dy) > TOUCH_PAN_THRESHOLD) {
          dragRef.current.moved = true;
          const { mpp } = viewRef.current;
          const next = { ...viewRef.current, cx: touch.panCX + dx * mpp, cz: touch.panCZ + dy * mpp };
          const limit = outerRectRef.current;
          viewRef.current = limit ? clampView(next, limit) : next;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) touch.startDist = 0;
      if (e.touches.length === 0) touch.panActive = false;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd);
    canvas.addEventListener("touchcancel", onTouchEnd);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [planUrl]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  // Skipped entirely while the minimap is collapsed (off-screen via CSS
  // translate). No point burning a full canvas redraw + player-FOV/path
  // sampling each frame when the user can't see it.
  useEffect(() => {
    if (!expanded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let raf: number;

    // Track canvas backing-store size so we only resize on actual change.
    // Setting canvas.width/height every frame triggers a buffer realloc and
    // a full GPU upload — pure waste when dimensions are stable.
    let backingW = 0;
    let backingH = 0;

    const draw = () => {
      // Live size from the ref (not the render closure) so corner-drag resizes
      // are picked up every frame without re-arming this effect.
      const { w: W, h: H } = mapSizeRef.current;
      const view = viewRef.current;

      const targetW = W * dpr;
      const targetH = H * dpr;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        backingW = targetW;
        backingH = targetH;
      }
      void backingW; void backingH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // High-quality interpolation for the floor-plan PNG. Default smoothing
      // is browser-dependent and reads as "soft / blurry" on mobile where
      // the source PNG is downsampled into a high-DPR backing store. This
      // is NOT backdrop-filter — changing --ui-glass-blur has no effect on
      // the canvas bitmap; only this 2D-context flag does.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Layers can be smaller than the canvas when zoomed out, so pans smear
      // without a full clear.
      ctx.clearRect(0, 0, W, H);

      // `vb` describes the CANVAS in image-bounds shape, which is what lets the
      // painters below keep their `(bounds, W, H)` signature with no transform.
      const vb = viewBounds(view, W, H);
      const place = (b: MinimapData["bounds"]) => {
        const p0 = worldToPixel(b.minX, b.minZ, vb, W, H);
        const p1 = worldToPixel(b.maxX, b.maxZ, vb, W, H);
        return { x: p0.px, y: p0.py, w: p1.px - p0.px, h: p1.py - p0.py };
      };

      ctx.save();

      // Layer 1 — the aerial, always dimmed.
      if (siteDimRef.current && siteBoundsRef.current) {
        const r = place(siteBoundsRef.current);
        ctx.drawImage(siteDimRef.current, r.x, r.y, r.w, r.h);
      }

      // Layer 2 — the plan, dimmed.
      const planPlace = planLayer ? place(planLayer.bounds) : null;
      if (planDimRef.current && planPlace) {
        ctx.drawImage(planDimRef.current, planPlace.x, planPlace.y, planPlace.w, planPlace.h);
      }

      // Layer 3 — the zone in colour: the same image at identical placement,
      // clipped, so the patch cannot drift from the grey it sits in.
      const zr = zoneRectRef.current;
      if (zr) {
        const z0 = worldToPixel(zr.maxX, zr.maxZ, vb, W, H);
        const z1 = worldToPixel(zr.minX, zr.minZ, vb, W, H);
        const zx = Math.min(z0.px, z1.px);
        const zy = Math.min(z0.py, z1.py);
        const zw = Math.abs(z1.px - z0.px);
        const zh = Math.abs(z1.py - z0.py);

        if (planRef.current && planPlace) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(zx, zy, zw, zh);
          ctx.clip();
          ctx.drawImage(planRef.current, planPlace.x, planPlace.y, planPlace.w, planPlace.h);
          ctx.restore();
        }

        // Drawn even with no plan image, so the clickable area stays visible.
        const reject = rejectRef.current;
        ctx.save();
        ctx.strokeStyle = reject > 0 ? `rgba(255,69,58,${0.35 + reject * 0.65})` : "rgba(255,255,255,0.35)";
        ctx.lineWidth = reject > 0 ? 2.5 : 1.5;
        if (!planRef.current) ctx.setLineDash([6, 4]);
        ctx.strokeRect(zx, zy, zw, zh);
        ctx.restore();
        if (reject > 0) rejectRef.current = Math.max(0, reject - 0.04);
      }

      const ctrl = playerControllerRef.current;
      const bounds = vb;
      // Fixed, small marker size (Google-Maps style) — path / ripple must NOT
      // scale up with the canvas.
      const markerScale = MARKER_SCALE;
      // Taper on a small (phone) canvas, where the fixed 1.25 reads oversized.
      const playerScale = MARKER_SCALE * Math.max(0.55, Math.min(1, W / 360));
      // Hotspot dots taper harder — clustered pins read as one blob otherwise.
      const hotspotScale = MARKER_SCALE * Math.max(0.45, Math.min(1, W / 520));
      if (ctrl) {
        const pos = ctrl.getPosition();
        const moving = ctrl.isMoving();
        // Active route while walking; otherwise a preview route to the selected
        // hotspot (so picking a destination draws the path before "Start").
        const pathPts = moving
          ? ctrl.getPath()
          : (selectedDestIdRef.current ? ctrl.getPreviewPath3D().map((p) => ({ x: p.x, z: p.z })) : []);
        if (pathPts.length > 0) {
          // No on-route distance/ETA pill — that readout lives in the bottom
          // map overlay (selected-destination card / Walking banner), so drawing
          // it on the line too would be redundant.
          drawPath(ctx, pathPts, pos, bounds, W, H, markerScale);
        }
        // Crowd-flow zone overlays — the SAME shapes (and colours) the 3D
        // heatmap shows: each zone's actual mesh triangles are filled as one
        // path, so the map image matches the mesh exactly.
        if (destLabelRef.current === "crowdflow") {
          const zones = useNavUiStore.getState().crowdFlowZones;
          for (const z of zones) {
            ctx.beginPath();
            for (const tri of z.tris) {
              const p0 = worldToPixel(tri[0][0], tri[0][1], bounds, W, H);
              const p1 = worldToPixel(tri[1][0], tri[1][1], bounds, W, H);
              const p2 = worldToPixel(tri[2][0], tri[2][1], bounds, W, H);
              ctx.moveTo(p0.px, p0.py);
              ctx.lineTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.closePath();
            }
            ctx.fillStyle = CROWD_FLOW_COLOR[z.level] + "50"; // ~30% alpha
            ctx.fill();
          }
        }
        // The live marker is the GROUND projection of wherever the camera is —
        // every layout here is a fly pose, so its Y is meaningless on a plan and
        // its XZ can sit outside the zone. Pinning it to the zone keeps the dot
        // on the drawn part of the plan instead of sliding off-canvas. The route
        // above still uses the true position, so a walk is never distorted.
        const marker = zr ? clampPoint(zr, pos.x, pos.z) : pos;
        drawPlayerFOV(ctx, marker, ctrl.getRotationY(), bounds, W, H, playerScale);
        // destination hotspots for the active label (dots + name · distance).
        // `zoom` keeps them a constant screen size under the pan+zoom transform,
        // so zooming in spreads clustered dots apart instead of magnifying them.
        if (destLabelRef.current && hotspotsRef.current.length) {
          drawHotspots(ctx, hotspotsRef.current, bounds, W, H, hotspotScale, selectedDestIdRef.current, listModeRef.current, 1);
        }
      }
      const cm = clickMarkerRef.current;
      if (cm) {
        const p = worldToPixel(cm.x, cm.z, vb, W, H);
        drawClickMarker(ctx, { px: p.px, py: p.py, alpha: cm.alpha }, markerScale);
        cm.alpha -= 0.02;
        if (cm.alpha <= 0) clickMarkerRef.current = null;
      }

      // `lb` is the whole canvas now, so stickers project through `vb` too.
      if (minimapData?.stickers?.length) {
        drawStickers(ctx, minimapData.stickers, vb, { dx: 0, dy: 0, dw: W, dh: H }, W, H);
      }

      ctx.restore();

      const nowDrifted = hasDrifted(view, homeRef.current);
      if (nowDrifted !== driftedRef.current) {
        driftedRef.current = nowDrifted;
        setDrifted(nowDrifted);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [planLayer, minimapData, playerControllerRef, expanded]);

  // ── Click → navigate ─────────────────────────────────────────────────────
  // Ignored on drag. Clicks outside the walkable zone pulse its outline rather
  // than being swallowed, which would read as a broken map.
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved || resizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // While walking, the map is read-only — no re-selecting / re-routing. Use
    // Stop first. (Prevents starting a second walk mid-walk.)
    if (playerControllerRef.current?.isMoving()) return;

    const W = mapWidth;
    const H = mapHeight;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;

    const vb = viewBounds(viewRef.current, W, H);
    const world = pixelToWorld(px, py, vb, W, H);

    const zone = zoneRectRef.current;
    if (zone && !contains(zone, world.x, world.z)) {
      rejectRef.current = 1;
      return;
    }

    // List-mode (memorial): the plan is fully NON-interactive — destinations
    // are picked from the numbered list under it, never by tapping the map.
    if (listModeRef.current) return;

    // When a label's hotspots are shown, a tap selects the nearest hotspot
    // (previewing its route) instead of walking; an empty tap clears it.
    if (destLabelRef.current) {
      const HIT_PX = 18;
      let best = HIT_PX;
      let hit: MapHotspot | null = null;
      for (const h of hotspotsRef.current) {
        const p = worldToPixel(h.x, h.z, vb, W, H);
        const d = Math.hypot(p.px - px, p.py - py);
        if (d < best) { best = d; hit = h; }
      }
      if (hit) selectMapDestination(hit.id, hit.x, hit.z);
      else clearDestSelection();
      return;
    }

    clickMarkerRef.current = { x: world.x, z: world.z, alpha: 1 };
    navigateFromMinimap(world.x, world.z);
  }, [mapWidth, mapHeight, navigateFromMinimap, selectMapDestination, clearDestSelection, playerControllerRef]);

  // ── Recenter ──────────────────────────────────────────────────────────────
  // Returns to the zone framing centred on the PLAYER, not a plain reset.
  const recenter = useCallback(() => {
    const home = homeRef.current;
    const pos = playerControllerRef.current?.getPosition();
    const zr = zoneRectRef.current;
    // Clamped for the same reason the marker is: recentring on a fly camera
    // would otherwise frame empty water a kilometre off the terminal.
    const at = pos && zr ? clampPoint(zr, pos.x, pos.z) : pos;
    const target: View = at
      ? { cx: at.x, cz: at.z, mpp: home.mpp }
      : { ...home };
    const from = { ...viewRef.current };
    const DUR = 320;
    let start = 0;
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    const step = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / DUR);
      // Same easeInOutQuad as the small<->full size toggle.
      const t = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      viewRef.current = {
        cx: from.cx + (target.cx - from.cx) * t,
        cz: from.cz + (target.cz - from.cz) * t,
        mpp: from.mpp + (target.mpp - from.mpp) * t,
      };
      if (k < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  }, [playerControllerRef]);

  useEffect(() => () => { if (tweenRef.current) cancelAnimationFrame(tweenRef.current); }, []);

  return {
    canvasRef,
    mapWidth,
    mapHeight,
    radioWidth,
    expanded,
    toggleExpanded,
    closeMap,
    fullScreen,
    toggleFullScreen,
    recenter,
    drifted,
    handleClick,
    playerControllerRef,
    isMoving,
    stopNav,
    // destination label hotspots
    destCats,
    destLabel,
    pickDestLabel,
    mapOptions,
    mapOption,
    pickMapOption,
    mapDests,
    listMode,
    selectMapDestination,
    selectedDestId,
    selectedPoi: mapDests.find((p) => p.id === selectedDestId) ?? null,
    startSelectedDest,
    teleportSelectedDest,
    clearDestSelection,
  };
}
