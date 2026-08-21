"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useScene } from "../../context/scene-context";
import {
  DEFAULT_MAP_SIZE,
  MIN_ZOOM, MAX_ZOOM, ZOOM_FACTOR,
  STICKER_MARGIN_PX, MOBILE_STICKER_MARGIN_PX,
  MAP_WINDOW_DEFAULT, MAP_FULL_INSET_X, MAP_FULL_CHROME_Y, SIDE_LEGEND_W,
} from "../utils/constants";
import { pixelToWorld, worldToPixel } from "../utils/coord-utils";
import {
  drawFloorPlan, drawPath,
  drawPlayerFOV, drawClickMarker,
  drawStickers, drawHotspots,
  type ImageRect, type MapHotspot,
} from "../utils/draw";
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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const clickMarkerRef = useRef<{ px: number; py: number; alpha: number } | null>(null);
  // Rect (in logical canvas px) where the floor plan image is drawn (CONTAIN mode).
  // Used to map clicks → image-relative coords and ignore clicks outside the image.
  const letterboxRef = useRef<ImageRect>({ dx: 0, dy: 0, dw: 0, dh: 0 });

  // Pan + zoom — stored in refs; RAF loop reads them directly, no re-render needed
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; moved: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0,
  });
  // Kept for the click/pan guards; always false now that drag-resize is gone.
  const resizingRef = useRef(false);

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

  // Canvas size is locked to a square. The OUTER size matches `mapSize` —
  // same dimensions the card had before stickers existed — and a thin
  // `marginPx` strip is reserved INSIDE every edge to host sticker labels.
  // The floor plan shrinks by 2 × marginPx in each axis to make room; FOV /
  // path scaling tracks the image rect (lb.dw / DEFAULT_MAP_SIZE) so the
  // player overlays scale down with it and stay visually balanced.
  //
  // Floors WITHOUT stickers get zero margin so the floor plan fills the
  // canvas edge-to-edge — there's no label to make room for, so reserving
  // space just shrinks the plan unnecessarily.
  const hasStickers = !!minimapData?.stickers?.length;
  const minDim = Math.min(mapDims.w, mapDims.h);
  const marginPx = !hasStickers
    ? 0
    : minDim < DEFAULT_MAP_SIZE ? MOBILE_STICKER_MARGIN_PX : STICKER_MARGIN_PX;
  const mapWidth  = mapDims.w;
  const mapHeight = mapDims.h;
  // Sync mapSizeRef after render so event handlers always read the latest size
  useLayoutEffect(() => {
    mapSizeRef.current = { w: mapWidth, h: mapHeight };
  }, [mapWidth, mapHeight]);

  // Clamp offset so zoomed content never exposes blank canvas
  const clampOffset = useCallback(() => {
    const { w: W, h: H } = mapSizeRef.current;
    const z = zoomRef.current;
    offsetRef.current.x = Math.max(W * (1 - z), Math.min(0, offsetRef.current.x));
    offsetRef.current.y = Math.max(H * (1 - z), Math.min(0, offsetRef.current.y));
  }, []);

  // Re-clamp after window resize changes canvas size
  useEffect(() => { clampOffset(); }, [mapWidth, mapHeight, clampOffset]);

  // Reset pan+zoom when floor plan changes
  useEffect(() => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }, [minimapData?.imageUrl]);

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
      const short = window.matchMedia("(max-height: 540px)").matches;
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
    const url = minimapData?.imageUrl;
    if (!url) return;
    const img = new Image();
    img.onload = () => { imageRef.current = img; };
    img.src = url;
  }, [minimapData?.imageUrl]);

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

    // Apply a zoom factor centered on a canvas-space point (cx, cy).
    const applyZoom = (factor: number, cx: number, cy: number) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
      if (newZoom === zoomRef.current) return;
      const ratio = newZoom / zoomRef.current;
      offsetRef.current.x = cx - (cx - offsetRef.current.x) * ratio;
      offsetRef.current.y = cy - (cy - offsetRef.current.y) * ratio;
      zoomRef.current = newZoom;
      clampOffset();
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
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      };
      // List-mode plan is non-interactive → keep the plain cursor.
      if (!listModeRef.current) canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      // Pan is disabled — the canvas must not move under the pointer. We only
      // track whether this became a drag so handleClick ignores it (no stray
      // navigate on a click-drag-release).
      if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
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
      startZoom: number;
      midX: number;
      midY: number;
      panActive: boolean;
      panSX: number;
      panSY: number;
      panOX: number;
      panOY: number;
    };
    const touch: TouchState = {
      startDist: 0,
      startZoom: 1,
      midX: 0,
      midY: 0,
      panActive: false,
      panSX: 0,
      panSY: 0,
      panOX: 0,
      panOY: 0,
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
        touch.startZoom = zoomRef.current;
        const mid = clientToCanvas((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
        touch.midX = mid.cx;
        touch.midY = mid.cy;
        touch.panActive = false;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        touch.panActive = true;
        touch.panSX = t.clientX;
        touch.panSY = t.clientY;
        touch.panOX = offsetRef.current.x;
        touch.panOY = offsetRef.current.y;
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
        const targetZoom = touch.startZoom * (dist / touch.startDist);
        const factor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom)) / zoomRef.current;
        applyZoom(factor, touch.midX, touch.midY);
      } else if (e.touches.length === 1 && touch.panActive) {
        const t = e.touches[0];
        const dx = t.clientX - touch.panSX;
        const dy = t.clientY - touch.panSY;
        // Pan disabled — once the finger moves past the tap threshold, mark it a
        // drag so the tap is ignored, but never translate the canvas.
        if (Math.abs(dx) > TOUCH_PAN_THRESHOLD || Math.abs(dy) > TOUCH_PAN_THRESHOLD) {
          dragRef.current.moved = true;
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
  }, [clampOffset, minimapData?.imageUrl]);

  // ── Draw loop ─────────────────────────────────────────────────────────────
  // Skipped entirely while the minimap is collapsed (off-screen via CSS
  // translate). No point burning a full canvas redraw + player-FOV/path
  // sampling each frame when the user can't see it.
  useEffect(() => {
    if (!expanded) return;
    const canvas = canvasRef.current;
    if (!canvas || !minimapData) return;
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
      const zoom = zoomRef.current;
      const ox = offsetRef.current.x;
      const oy = offsetRef.current.y;

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

      // Clear every frame. Previously the canvas was sized to the bounds
      // aspect and the image fully covered it (with offset clamping during
      // zoom/pan), so the drawImage call alone overwrote the prior frame.
      // With the canvas now locked to a square the image is letterboxed —
      // the bands outside the image rect never get redrawn, so zoom/pan
      // accumulates stale draws and the player sees "multiple images".
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(zoom, zoom);

      // Draw image (CONTAIN) inside the inner rect (canvas minus sticker
      // margin), then capture where it landed for the overlays below.
      const lb = imageRef.current
        ? drawFloorPlan(ctx, imageRef.current, W, H, marginPx, marginPx)
        : { dx: marginPx, dy: marginPx, dw: Math.max(1, W - 2 * marginPx), dh: Math.max(1, H - 2 * marginPx) };
      letterboxRef.current = lb;

      // Player / path / marker — all in image-relative space.
      ctx.save();
      ctx.translate(lb.dx, lb.dy);
      const ctrl = playerControllerRef.current;
      const bounds = minimapData.bounds;
      // Fixed, small marker size (Google-Maps style) — path / ripple must NOT
      // scale up with the canvas.
      const markerScale = MARKER_SCALE;
      // The PLAYER circle alone tapers down on a small (phone) map, where the
      // fixed 1.25 reads oversized; stays fixed on desktop / full-screen.
      const playerScale = MARKER_SCALE * Math.max(0.55, Math.min(1, lb.dw / 360));
      // Hotspot dots taper HARDER on small (phone) canvases — the memorial's
      // clustered gate pins read as one congested blob at the fixed size.
      const hotspotScale = MARKER_SCALE * Math.max(0.45, Math.min(1, lb.dw / 520));
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
          drawPath(ctx, pathPts, pos, bounds, lb.dw, lb.dh, markerScale);
        }
        // Crowd-flow zone overlays — the SAME shapes (and colours) the 3D
        // heatmap shows: each zone's actual mesh triangles are filled as one
        // path, so the map image matches the mesh exactly.
        if (destLabelRef.current === "crowdflow") {
          const zones = useNavUiStore.getState().crowdFlowZones;
          for (const z of zones) {
            ctx.beginPath();
            for (const tri of z.tris) {
              const p0 = worldToPixel(tri[0][0], tri[0][1], bounds, lb.dw, lb.dh);
              const p1 = worldToPixel(tri[1][0], tri[1][1], bounds, lb.dw, lb.dh);
              const p2 = worldToPixel(tri[2][0], tri[2][1], bounds, lb.dw, lb.dh);
              ctx.moveTo(p0.px, p0.py);
              ctx.lineTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.closePath();
            }
            ctx.fillStyle = CROWD_FLOW_COLOR[z.level] + "50"; // ~30% alpha
            ctx.fill();
          }
        }
        drawPlayerFOV(ctx, pos, ctrl.getRotationY(), bounds, lb.dw, lb.dh, playerScale);
        // destination hotspots for the active label (dots + name · distance).
        // `zoom` keeps them a constant screen size under the pan+zoom transform,
        // so zooming in spreads clustered dots apart instead of magnifying them.
        if (destLabelRef.current && hotspotsRef.current.length) {
          drawHotspots(ctx, hotspotsRef.current, bounds, lb.dw, lb.dh, hotspotScale, selectedDestIdRef.current, listModeRef.current, zoom);
        }
      }
      if (clickMarkerRef.current) {
        drawClickMarker(ctx, clickMarkerRef.current, markerScale);
        clickMarkerRef.current.alpha -= 0.02;
        if (clickMarkerRef.current.alpha <= 0) clickMarkerRef.current = null;
      }
      ctx.restore(); // undo image-area translate

      // Stickers live in the canvas margin (outside the floor area), so they
      // are drawn AFTER the image-area translate is undone but BEFORE the
      // pan+zoom undo, so they pan/zoom alongside the floor plan and their
      // anchors stay aligned to the world points they label.
      if (minimapData.stickers?.length) {
        drawStickers(ctx, minimapData.stickers, minimapData.bounds, lb, W, H);
      }

      ctx.restore(); // undo pan+zoom
      ctx.restore(); // undo clip
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [minimapData, marginPx, playerControllerRef, expanded]);

  // ── Click → navigate ─────────────────────────────────────────────────────
  // Ignored if the mousedown turned into a drag (moved > 4 px).
  // Clicks outside the floor plan image area (letterbox) are also ignored.
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved || resizingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !minimapData) return;
    // While walking, the map is read-only — no re-selecting / re-routing. Use
    // Stop first. (Prevents starting a second walk mid-walk.)
    if (playerControllerRef.current?.isMoving()) return;

    const rect = canvas.getBoundingClientRect();
    const rawPx = ((e.clientX - rect.left) / rect.width) * mapWidth;
    const rawPy = ((e.clientY - rect.top) / rect.height) * mapHeight;

    // Undo pan+zoom to get logical canvas pixel
    const cx = (rawPx - offsetRef.current.x) / zoomRef.current;
    const cy = (rawPy - offsetRef.current.y) / zoomRef.current;

    // Convert to image-relative coords using the current letterbox rect
    const lb = letterboxRef.current;
    const ipx = cx - lb.dx;
    const ipy = cy - lb.dy;

    // Ignore clicks outside the image area
    if (ipx < 0 || ipy < 0 || ipx > lb.dw || ipy > lb.dh) return;

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
        const p = worldToPixel(h.x, h.z, minimapData.bounds, lb.dw, lb.dh);
        const d = Math.hypot(p.px - ipx, p.py - ipy);
        if (d < best) { best = d; hit = h; }
      }
      if (hit) selectMapDestination(hit.id, hit.x, hit.z);
      else clearDestSelection();
      return;
    }

    const world = pixelToWorld(ipx, ipy, minimapData.bounds, lb.dw, lb.dh);
    // Store marker in image-relative space (ctx is translated to lb origin when drawn)
    clickMarkerRef.current = { px: ipx, py: ipy, alpha: 1 };
    navigateFromMinimap(world.x, world.z);
  }, [minimapData, mapWidth, mapHeight, navigateFromMinimap, selectMapDestination, clearDestSelection, playerControllerRef]);

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
