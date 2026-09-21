"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useScene } from "../../context/scene-context";
import {
  ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM, ZOOM_OUT_MARGIN,
  MAP_WINDOW_DEFAULT, MAP_FULL_INSET_X, MAP_FULL_CHROME_Y, SIDE_LEGEND_W,
} from "../utils/constants";
import { SHORT_MEDIA_QUERY } from "@/shared/responsive";
import { BLACKOUT_VISIBLE_MS, FADE_IN_MS, FADE_OUT_MS } from "@/shared/ui/screens/fade-screen";
import { pixelToWorld, worldToPixel } from "../utils/coord-utils";
import {
  containRect, contextRect, drawPath,
  drawPlayerFOV, drawClickMarker,
  drawStickers,
  type ImageRect, type MapHotspot,
} from "../utils/draw";
import { useSite } from "@/config/context";
import { createStaticLayers } from "../utils/static-layers";
import isLowPower from "@/shared/runtime";
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

const MARKER_SCALE = 0.62;

const OFF_MESH_M = 8;

const TELEPORT_SETTLE_MS = FADE_IN_MS + 120 + BLACKOUT_VISIBLE_MS + FADE_OUT_MS + 80;

export function useMinimap() {
  const { playerControllerRef, minimapData, navigateFromMinimap, activeFloor, isMoving, triggerFloorTransition, layoutsOpen, setLayoutsOpen, fovOpen, setFovOpen } = useScene();

  const stopNav = useCallback(() => playerControllerRef.current?.stopNavigation(), [playerControllerRef]);

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
  const atTeleportOnly = (() => {
    if (!currentDestId || !currentDestCat) return false;
    const d = activeFloor?.dests?.[currentDestCat]?.find((x) => x.id === currentDestId);
    return !!d?.teleportOnly;
  })();
  const listMode = !!activeFloor?.mapListMode;
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
  const destLabelRef = useRef<DestinationCategory | null>(null);
  const selectedDestIdRef = useRef<string | null>(null);
  const hotspotsRef = useRef<MapHotspot[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Image-relative, like the plan overlays: the ctx is translated to the
   *  letterbox origin before it is drawn, so it tracks pan and zoom. */
  const clickMarkerRef = useRef<{ px: number; py: number; alpha: number } | null>(null);

  const planRef = useRef<HTMLImageElement | null>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  /** Where the plan landed inside the canvas (CONTAIN). Clicks are mapped
   *  through this rect, and ones outside it are dropped. */
  const letterboxRef = useRef<ImageRect>({ dx: 0, dy: 0, dw: 0, dh: 0 });

  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const resizingRef = useRef(false);

  const mapSizeRef = useRef({ w: 0, h: 0 });

  const [mapDims, setMapDims] = useState({ w: MAP_WINDOW_DEFAULT.w, h: MAP_WINDOW_DEFAULT.h });
  const [fullScreen, setFullScreen] = useState(false);
  const toggleFullScreen = useCallback(() => setFullScreen((v) => !v), []);
  // Width (px) of the right-hand category-radio column (20% of the window; the
  // canvas takes the other 80%).
  const [radioWidth, setRadioWidth] = useState(0);

  useEffect(() => {
    if (layoutsOpen || fovOpen) setMapExpanded(false);
  }, [layoutsOpen, fovOpen, setMapExpanded]);

  const toggleExpanded = useCallback(() => setMapExpanded(!expanded), [expanded, setMapExpanded]);

  const closeMap = useCallback(() => {
    setMapExpanded(false);
    closePanel();
    playerControllerRef.current?.clearPreview();
  }, [setMapExpanded, closePanel, playerControllerRef]);

  const lastLabelRef = useRef<DestinationCategory | null>(null);
  useEffect(() => { if (destLabel) lastLabelRef.current = destLabel; }, [destLabel]);

  const prevExpandedRef = useRef(expanded);
  useEffect(() => {
    if (expanded === prevExpandedRef.current) return;
    prevExpandedRef.current = expanded;
    if (expanded) {
      setLayoutsOpen(false);
      setFovOpen(false);
      if (listMode) {
        const fallback: DestinationCategory | undefined =
          (activeFloor?.dests?.layouts?.length ?? 0) > 0 ? "layouts" : destCats[0]?.key;
        const want = destLabel ?? lastLabelRef.current ?? fallback;
        if (want && destLabel !== want) toggleLabel(want);
      }
    } else {
      playerControllerRef.current?.clearPreview();
    }
  }, [expanded, destLabel, destCats, toggleLabel, setLayoutsOpen, setFovOpen, playerControllerRef, listMode, activeFloor]);

  const computeHotspots = useCallback(() => {
    const ctrl = playerControllerRef.current;
    const all = destLabel && destLabel !== "seatviews" ? (activeFloor?.dests?.[destLabel] ?? []) : [];
    const list = mapOption ? all.filter((p) => (p.option ?? "") === mapOption) : all;
    const dests = activeFloor?.transportDestinations ?? [];
    const mpu = navConfig.logic.displayMetersPerUnit;
    const next: MapDestination[] = list.flatMap((dest, destIdx) => {
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
        labeled: i === 0,
        num: destIdx + 1,
        here: dest.id === currentDestId,
        walkable: wu != null,
        crowd: dest.crowd,
      }));
    });
    setMapDestinations(next);
  }, [destLabel, mapOption, activeFloor, playerControllerRef, currentDestId, atTeleportOnly]);

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

  useEffect(() => {
    const raf = requestAnimationFrame(() => computeHotspots());
    return () => cancelAnimationFrame(raf);
  }, [computeHotspots, expanded]);

  const clearDestSelection = useCallback(() => {
    setSelectedDestId(null);
    playerControllerRef.current?.clearPreview();
  }, [setSelectedDestId, playerControllerRef]);

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
    useNavUiStore.getState().setNavHud(true);
    ctrl.setOnNavigationComplete(() => {
      const eyeY = cam.position[1];
      const ch = ctrl.getPosition().y - ctrl.getFootPosition().y;
      const footGuess = eyeY ? eyeY - ch : 0;
      const y = full.exactPose && eyeY ? eyeY - ch : ctrl.probeFloorY(x, z, footGuess) ?? footGuess;
      ctrl.teleportTo([x, y, z], cam.rotation, true);
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

  // The map layers come from the ACTIVE MODEL's file: a bake with its own
  // floorplan render or its own zone framing carries them in its own document.
  const siteMap = useSite().scene.map;

  const mapWidth  = mapDims.w;
  const mapHeight = mapDims.h;
  useLayoutEffect(() => {
    mapSizeRef.current = { w: mapWidth, h: mapHeight };
  }, [mapWidth, mapHeight]);

  const planLayer = useMemo(() => {
    const p = siteMap?.plan;
    if (p) return { url: p.imageUrl, bounds: p.bounds };
    return minimapData ? { url: minimapData.imageUrl, bounds: minimapData.bounds } : null;
  }, [siteMap, minimapData]);
  const planUrl = planLayer?.url;

  const baseLayer = useMemo(() => {
    const b = siteMap?.base;
    return b ? { url: b.imageUrl, bounds: b.bounds } : null;
  }, [siteMap]);
  const baseUrl = baseLayer?.url;

  /** The bounds swap both axes, so this is what the marker clamp needs. */
  const planRect = useMemo(() => {
    const b = planLayer?.bounds;
    if (!b) return null;
    return {
      minX: Math.min(b.minX, b.maxX), maxX: Math.max(b.minX, b.maxX),
      minZ: Math.min(b.minZ, b.maxZ), maxZ: Math.max(b.minZ, b.maxZ),
    };
  }, [planLayer]);

  const planRectRef = useRef<typeof planRect>(null);
  useEffect(() => { planRectRef.current = planRect; }, [planRect]);

  const contentRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Derived from `contentRef` each frame — see ZOOM_OUT_MARGIN. */
  const minZoomRef = useRef(1);

  /** What the map opens on. Plain world rect; the plan's own extent when a site
   *  does not author one, which is the old whole-plan framing. */
  const zoneRect = useMemo(() => siteMap?.zone ?? planRect, [siteMap, planRect]);
  const zoneRectRef = useRef<typeof zoneRect>(null);
  useEffect(() => { zoneRectRef.current = zoneRect; }, [zoneRect]);

  const homeRef = useRef<{ z: number; ox: number; oy: number } | null>(null);
  /** The home actually snapped to, so a resize can re-snap without fighting a
   *  user who has panned away. */
  const appliedHomeRef = useRef<{ z: number; ox: number; oy: number } | null>(null);
  const userMovedRef = useRef(false);

  const clampOffset = useCallback(() => {
    const { w: W, h: H } = mapSizeRef.current;
    const z = zoomRef.current;
    const c = contentRef.current ?? { x0: 0, y0: 0, x1: W, y1: H };
    const axis = (off: number, c0: number, c1: number, size: number) => {
      const lo = size - z * c1;
      const hi = -z * c0;
      return lo <= hi ? Math.min(hi, Math.max(lo, off)) : (size - z * (c0 + c1)) / 2;
    };
    offsetRef.current.x = axis(offsetRef.current.x, c.x0, c.x1, W);
    offsetRef.current.y = axis(offsetRef.current.y, c.y0, c.y1, H);
  }, []);

  useEffect(() => { clampOffset(); }, [mapWidth, mapHeight, clampOffset]);

  useEffect(() => {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    appliedHomeRef.current = null;
    userMovedRef.current = false;
  }, [planUrl]);

  /** Drives the recenter button. Ref-guarded so a settled view doesn't dispatch
   *  a state update every frame. */
  const [drifted, setDrifted] = useState(false);
  const driftedRef = useRef(false);
  const tweenRef = useRef(0);

  useEffect(() => {
    if (!expanded) return;
    appliedHomeRef.current = null;
    userMovedRef.current = false;
  }, [expanded]);

  const recenter = useCallback(() => {
    const home = homeRef.current;
    if (!home) return;
    userMovedRef.current = false;
    const fromZ = zoomRef.current;
    const from = { ...offsetRef.current };
    const DUR = 320;
    let start = 0;
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    const step = (ts: number) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / DUR);
      const t = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      zoomRef.current = fromZ + (home.z - fromZ) * t;
      offsetRef.current = {
        x: from.x + (home.ox - from.x) * t,
        y: from.y + (home.oy - from.y) * t,
      };
      if (k < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => { if (tweenRef.current) cancelAnimationFrame(tweenRef.current); }, []);

  const radioKey = destCats.map((c) => c.short).join("|");
  const tweenRaf = useRef(0);
  const sizedOnce = useRef(false);
  useEffect(() => {
    const targetDims = () => {
      // Landscape-phone viewport: a slimmer left rail + tighter chrome, and a
      // smaller default window so the whole thing fits on screen.
      const short = window.matchMedia(SHORT_MEDIA_QUERY).matches;
      const insetX = short ? 72 : MAP_FULL_INSET_X;
      const listChrome = listMode ? (short ? 95 : 215) : 0;
      const baseChrome = fullScreen ? (short ? 58 : 104) : short ? 118 : MAP_FULL_CHROME_Y;
      const chromeY = baseChrome + listChrome;
      const defW = (short ? 320 : MAP_WINDOW_DEFAULT.w) + (listMode ? 60 : 0);
      const defH = short ? 200 : MAP_WINDOW_DEFAULT.h;
      const sideLegendW = listMode && short ? SIDE_LEGEND_W : 0;
      const availW = Math.max(200, window.innerWidth - insetX - sideLegendW);
      const availH = Math.max(150, window.innerHeight - chromeY);
      let winW = fullScreen ? availW : Math.min(defW, availW);
      const winH = fullScreen ? availH : Math.min(defH, availH);
      if (listMode && short && !fullScreen) winW = Math.min(winW, winH + 28);
      let maxText = 0;
      const cv = document.createElement("canvas");
      const cx = cv.getContext("2d");
      if (cx) {
        cx.font = "600 11.5px system-ui, -apple-system, sans-serif";
        for (const s of radioKey.split("|")) if (s) maxText = Math.max(maxText, cx.measureText(s).width);
      }
      const radioW = 0;
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
    commitRadio(t.radioW);

    if (tweenRaf.current) cancelAnimationFrame(tweenRaf.current);
    if (!sizedOnce.current) {
      sizedOnce.current = true;
      commitSize(t.w, t.h);
    } else {
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

  useEffect(() => {
    if (!planUrl) return;
    const img = new Image();
    img.onload = () => { planRef.current = img; };
    img.src = planUrl;
  }, [planUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    const img = new Image();
    img.onload = () => { baseRef.current = img; };
    img.src = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applyZoom = (factor: number, cx: number, cy: number) => {
      const next = Math.max(minZoomRef.current, Math.min(MAX_ZOOM, zoomRef.current * factor));
      if (next === zoomRef.current) return;
      const ratio = next / zoomRef.current;
      offsetRef.current.x = cx - (cx - offsetRef.current.x) * ratio;
      offsetRef.current.y = cy - (cy - offsetRef.current.y) * ratio;
      zoomRef.current = next;
      userMovedRef.current = true;
      clampOffset();
    };

    const clientToCanvas = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { w: W, h: H } = mapSizeRef.current;
      return {
        cx: ((clientX - rect.left) / rect.width) * W,
        cy: ((clientY - rect.top) / rect.height) * H,
      };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 100;
      const stepK = Math.min(1, Math.abs(dy) / 100);
      const factor = dy < 0
        ? 1 + (ZOOM_FACTOR - 1) * stepK
        : 1 / (1 + (ZOOM_FACTOR - 1) * stepK);
      const { cx, cy } = clientToCanvas(e.clientX, e.clientY);
      applyZoom(factor, cx, cy);
    };

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
      if (!listModeRef.current) canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
      if (!d.moved) return;
      offsetRef.current.x = d.ox + dx;
      offsetRef.current.y = d.oy + dy;
      userMovedRef.current = true;
      clampOffset();
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
      canvas.style.cursor = listModeRef.current ? "default" : "crosshair";
    };

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
        const target = touch.startZoom * (dist / touch.startDist);
        applyZoom(Math.max(minZoomRef.current, Math.min(MAX_ZOOM, target)) / zoomRef.current, touch.midX, touch.midY);
      } else if (e.touches.length === 1 && touch.panActive) {
        const t = e.touches[0];
        const dx = t.clientX - touch.panSX;
        const dy = t.clientY - touch.panSY;
        if (Math.abs(dx) > TOUCH_PAN_THRESHOLD || Math.abs(dy) > TOUCH_PAN_THRESHOLD) {
          dragRef.current.moved = true;
          offsetRef.current.x = touch.panOX + dx;
          offsetRef.current.y = touch.panOY + dy;
          userMovedRef.current = true;
          clampOffset();
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
  }, [planUrl, clampOffset]);

  useEffect(() => {
    if (!expanded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let raf: number;
    // Owned by this effect, so a canvas swap (floor change, resize remount)
    // releases the backing store rather than leaking one per remount.
    const statics = createStaticLayers(isLowPower());

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
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // The plan is letterboxed, so the bands beside it are never redrawn by
      // drawImage alone and a pan would smear stale frames across them.
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(zoom, zoom);

      const lb = planRef.current
        ? containRect(planRef.current, W, H)
        : { dx: 0, dy: 0, dw: W, dh: H };
      letterboxRef.current = lb;

      let c = { x0: lb.dx, y0: lb.dy, x1: lb.dx + lb.dw, y1: lb.dy + lb.dh };
      const baseRect =
        baseRef.current && planLayer?.bounds && baseLayer
          ? contextRect(baseLayer.bounds, planLayer.bounds, lb)
          : null;
      if (baseRect) {
        c = {
          x0: Math.min(c.x0, baseRect.dx), y0: Math.min(c.y0, baseRect.dy),
          x1: Math.max(c.x1, baseRect.dx + baseRect.dw),
          y1: Math.max(c.y1, baseRect.dy + baseRect.dh),
        };
      }
      contentRef.current = c;
      minZoomRef.current = Math.max(
        MIN_ZOOM,
        Math.min(1, Math.min(W / Math.max(1, (c.x1 - c.x0) * ZOOM_OUT_MARGIN),
                             H / Math.max(1, (c.y1 - c.y0) * ZOOM_OUT_MARGIN))),
      );

      const zr = zoneRectRef.current;
      if (zr && planLayer?.bounds) {
        const za = worldToPixel(zr.minX, zr.minZ, planLayer.bounds, lb.dw, lb.dh);
        const zb = worldToPixel(zr.maxX, zr.maxZ, planLayer.bounds, lb.dw, lb.dh);
        const zx0 = lb.dx + Math.min(za.px, zb.px);
        const zx1 = lb.dx + Math.max(za.px, zb.px);
        const zy0 = lb.dy + Math.min(za.py, zb.py);
        const zy1 = lb.dy + Math.max(za.py, zb.py);
        const hz = Math.min(
          MAX_ZOOM,
          Math.max(minZoomRef.current, Math.min(W / Math.max(1, zx1 - zx0), H / Math.max(1, zy1 - zy0))),
        );
        const home = {
          z: hz,
          ox: W / 2 - hz * (zx0 + zx1) / 2,
          oy: H / 2 - hz * (zy0 + zy1) / 2,
        };
        homeRef.current = home;

        // Snap on open, and follow a canvas resize — but only while the user is
        // still at home. Once they have moved, leave them alone.
        const ap = appliedHomeRef.current;
        const moved = !ap
          || Math.abs(ap.z - home.z) > 1e-3
          || Math.abs(ap.ox - home.ox) > 0.5
          || Math.abs(ap.oy - home.oy) > 0.5;
        if (moved && !userMovedRef.current) {
          zoomRef.current = home.z;
          offsetRef.current = { x: home.ox, y: home.oy };
          clampOffset();
          appliedHomeRef.current = { ...home };
        }
      }

      statics.draw(ctx, {
        plan: planRef.current,
        planRect: lb,
        base: baseRef.current,
        baseRect,
      }, { w: W, h: H, dpr, zoom, ox, oy });

      // Overlays live in image-relative space: the plan's bounds map straight
      // onto (0..lb.dw, 0..lb.dh), which is the 1:1 the render guarantees.
      ctx.save();
      ctx.translate(lb.dx, lb.dy);
      const ctrl = playerControllerRef.current;
      const bounds = planLayer?.bounds;
      const PW = lb.dw;
      const PH = lb.dh;
      // Fixed, small marker size (Google-Maps style) — path / ripple must NOT
      // scale up with the canvas.
      const markerScale = MARKER_SCALE;
      const playerScale = MARKER_SCALE * Math.max(0.55, Math.min(1, W / 360));
      if (ctrl && bounds) {
        const pos = ctrl.getPosition();
        const moving = ctrl.isMoving();
        // Active route while walking; otherwise a preview route to the selected
        // hotspot (so picking a destination draws the path before "Start").
        const pathPts = moving
          ? ctrl.getPath()
          : (selectedDestIdRef.current ? ctrl.getPreviewPath3D().map((p) => ({ x: p.x, z: p.z })) : []);
        if (pathPts.length > 0) {
          drawPath(ctx, pathPts, pos, bounds, PW, PH, markerScale);
        }
        if (destLabelRef.current === "crowdflow") {
          const zones = useNavUiStore.getState().crowdFlowZones;
          for (const z of zones) {
            ctx.beginPath();
            for (const tri of z.tris) {
              const p0 = worldToPixel(tri[0][0], tri[0][1], bounds, PW, PH);
              const p1 = worldToPixel(tri[1][0], tri[1][1], bounds, PW, PH);
              const p2 = worldToPixel(tri[2][0], tri[2][1], bounds, PW, PH);
              ctx.moveTo(p0.px, p0.py);
              ctx.lineTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.closePath();
            }
            ctx.fillStyle = CROWD_FLOW_COLOR[z.level] + "50";
            ctx.fill();
          }
        }
        const pr = planRectRef.current;
        const marker = pr
          ? {
              x: Math.min(pr.maxX, Math.max(pr.minX, pos.x)),
              z: Math.min(pr.maxZ, Math.max(pr.minZ, pos.z)),
            }
          : pos;
        drawPlayerFOV(ctx, marker, ctrl.getRotationY(), bounds, PW, PH, playerScale);
      }
      const cm = clickMarkerRef.current;
      if (cm) {
        drawClickMarker(ctx, cm, markerScale);
        cm.alpha -= 0.02;
        if (cm.alpha <= 0) clickMarkerRef.current = null;
      }

      ctx.restore();

      if (bounds && minimapData?.stickers?.length) {
        drawStickers(ctx, minimapData.stickers, bounds, lb, W, H);
      }

      ctx.restore();

      // Anything but the opening framing offers a way back to it. Read from the
      // refs, not this frame's locals, so the snap above does not read as drift.
      const hm = homeRef.current;
      const now = !!hm
        && (Math.abs(zoomRef.current / hm.z - 1) > 0.02
          || Math.hypot(offsetRef.current.x - hm.ox, offsetRef.current.y - hm.oy) > 4);
      if (now !== driftedRef.current) {
        driftedRef.current = now;
        setDrifted(now);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      statics.dispose();
    };
  }, [planLayer, baseLayer, minimapData, playerControllerRef, expanded, clampOffset]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.moved || resizingRef.current) return;
    const canvas = canvasRef.current;
    const bounds = planLayer?.bounds;
    if (!canvas || !bounds) return;
    // While walking, the map is read-only — no re-selecting / re-routing. Use
    // Stop first. (Prevents starting a second walk mid-walk.)
    if (playerControllerRef.current?.isMoving()) return;
    // List-mode (memorial): the plan is fully NON-interactive — destinations
    // are picked from the numbered list under it, never by tapping the map.
    if (listModeRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const rawPx = ((e.clientX - rect.left) / rect.width) * mapWidth;
    const rawPy = ((e.clientY - rect.top) / rect.height) * mapHeight;

    // Undo pan + zoom to get a logical canvas pixel, then the letterbox origin
    // to get an image-relative one.
    const cx = (rawPx - offsetRef.current.x) / zoomRef.current;
    const cy = (rawPy - offsetRef.current.y) / zoomRef.current;
    const lb = letterboxRef.current;
    const ipx = cx - lb.dx;
    const ipy = cy - lb.dy;
    if (ipx < 0 || ipy < 0 || ipx > lb.dw || ipy > lb.dh) return;

    const world = pixelToWorld(ipx, ipy, bounds, lb.dw, lb.dh);
    clickMarkerRef.current = { px: ipx, py: ipy, alpha: 1 };

    const ctrl = playerControllerRef.current;
    const near = ctrl?.nearestNavPoint();
    if (ctrl && near && near.dist > OFF_MESH_M) {
      // Behind the same fade every other teleport uses — the drop is hundreds
      // of metres, and cutting it would read as the scene glitching.
      triggerFloorTransition(() => {
        ctrl.teleportTo([near.x, near.y, near.z], [0, ctrl.getRotationY(), 0]);
      });
      window.setTimeout(() => navigateFromMinimap(world.x, world.z), TELEPORT_SETTLE_MS);
      return;
    }

    navigateFromMinimap(world.x, world.z);
  }, [planLayer, mapWidth, mapHeight, navigateFromMinimap, playerControllerRef, triggerFloorTransition]);

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
