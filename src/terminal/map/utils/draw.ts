import type { MinimapData, MinimapSticker } from "../types";
import {
  DEFAULT_MAP_SIZE,
  FOV_ANGLE, FOV_LENGTH, PLAYER_SIZE,
  PLAYER_FILL, PLAYER_STROKE,
  PATH_COLOR, ROUTE_CASING, ROUTE_PILL_BG, ROUTE_PILL_TEXT,
  CLICK_MARKER,
  STICKER_BG, STICKER_TEXT, STICKER_LINE,
} from "./constants";
import { worldToPixel } from "./coord-utils";
import { navConfig } from "../../navigation-config";

// ── Rounded-rect clip path ─────────────────────────────────────────────────
export function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);     ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);     ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();
}

export interface ImageRect { dx: number; dy: number; dw: number; dh: number; }

// ── Where the floor plan lands — CONTAIN mode, inside the inner rect ──────
// The canvas (W × H) reserves `marginX` / `marginY` pixels on each side for
// sticker labels. The floor plan + click-mapping live inside that inner
// rect; everything outside is dead space (clicks naturally fall outside the
// returned letterbox rect and are dropped by use-minimap.ts).
//
// With marginX = marginY = 0 this collapses to the original full-canvas
// behaviour so callers that don't need stickers keep working unchanged.
//
// Rect only — the caller draws. It used to fit and draw in one call, which
// stopped working once a layer had to go UNDERNEATH the plan: the rect is what
// places that layer, so it has to exist before anything is painted.
export function containRect(
  img: HTMLImageElement,
  W: number,
  H: number,
  marginX: number = 0,
  marginY: number = 0,
): ImageRect {
  const innerW = Math.max(1, W - 2 * marginX);
  const innerH = Math.max(1, H - 2 * marginY);

  const imgAspect   = img.naturalWidth / img.naturalHeight;
  const innerAspect = innerW / innerH;
  let dw: number, dh: number;
  // CONTAIN: scale so the WHOLE image is visible (no crop), then centre it so
  // the spare space is balanced on all sides.
  if (imgAspect > innerAspect) {
    // Relatively wider → fit width, letterbox top/bottom.
    dw = innerW; dh = innerW / imgAspect;
  } else {
    // Relatively taller → fit height, letterbox left/right.
    dh = innerH; dw = innerH * imgAspect;
  }
  return { dx: marginX + (innerW - dw) / 2, dy: marginY + (innerH - dh) / 2, dw, dh };
}

// ── Context layer — the surroundings, drawn UNDER the plan ────────────────
// Placed by running its own world rect through the PLAN's world→pixel
// transform, which is the whole trick: the two images are registered because
// they are both expressed in world metres and only one transform exists, not
// because anything was lined up by eye at runtime. The plan's letterbox stays
// the single source of truth for clicks and overlays; this layer is allowed to
// spill past the canvas, where it is clipped by the element itself.
//
// It is NOT letterboxed on its own. Doing that would fit it to the canvas
// independently and it would slide off the plan the moment the canvas aspect
// changed — the bug this arrangement exists to make impossible.
// Returns WHERE it drew, in the same logical canvas pixels as `lb`, so the
// caller can bound the pan clamp and the zoomed-out limit by it. Null when
// nothing was drawn.
// Returns WHERE it goes, in the same logical canvas pixels as `lb`, so the
// caller can bound the pan clamp and the zoomed-out limit by it — and so the
// static-layer cache can lay it out without painting. Null when it cannot be
// placed.
//
// Rect only, like `containRect`: painting moved into `static-layers.ts` once
// both layers stopped being drawn from source on every frame.
export function contextRect(
  baseBounds: MinimapData["bounds"],
  planBounds: MinimapData["bounds"],
  lb: ImageRect,
): ImageRect | null {
  const a = worldToPixel(baseBounds.minX, baseBounds.minZ, planBounds, lb.dw, lb.dh);
  const b = worldToPixel(baseBounds.maxX, baseBounds.maxZ, planBounds, lb.dw, lb.dh);
  const dw = b.px - a.px;
  const dh = b.py - a.py;
  // A non-positive extent means the two rects disagree about which way the
  // axes run — drawImage cannot mirror, and a layer exported against a mirrored
  // plan needs re-exporting, not flipping here. Report nothing and leave the
  // plan alone rather than painting it somewhere wrong.
  if (!(dw > 0) || !(dh > 0)) return null;
  return { dx: lb.dx + a.px, dy: lb.dy + a.py, dw, dh };
}

// ── Sticker labels in the margin ──────────────────────────────────────────
// Each sticker tags a world XZ point (already visualised as a dot baked into
// the floor-plan PNG). We project the world point into image-pixel space,
// pick the nearest canvas edge, and draw a rounded-rect label there with a
// leader line back to the anchor. Stickers are drawn under the same pan+zoom
// transform as the floor plan so they track when the user zooms — they will
// slide off-canvas at high zoom, but the relevant ones near the player stay
// visible, which matches how the floor plan itself behaves.
//
// Coordinates here are in canvas-local space (the caller has already applied
// pan+zoom + the image-area translate is NOT applied — we work in raw W×H).
export function drawStickers(
  ctx: CanvasRenderingContext2D,
  stickers: MinimapSticker[],
  bounds: MinimapData["bounds"],
  lb: ImageRect,
  W: number,
  H: number,
) {
  if (!stickers.length) return;

  // Scale all sticker dimensions with the canvas size so the box reads the
  // same RELATIVE weight on phone and desktop. Without this, fixed pixel
  // dimensions look ~75% larger on the 170 px mobile canvas than on the
  // 300 px desktop one — same pattern `drawPlayerFOV` uses below.
  const scale = W / DEFAULT_MAP_SIZE;
  // Sized to read as a smaller sibling of the floor PillBtns above the map.
  // Floor pills run ~12 px / py-2 / px-3 on desktop; stickers are ~70% of
  // that so they don't compete with the pill row visually.
  const fontPx   = Math.max(8, Math.round(8 * scale));
  const padInner = Math.max(4, Math.round(7  * scale));
  const boxH     = Math.max(11, Math.round(15 * scale));
  const edgeGap  = Math.max(2, Math.round(3  * scale));
  // Pill shape — fully rounded to match PillBtn's rounded-full.
  const radius   = boxH / 2;

  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";

  for (const s of stickers) {
    // World → pixel inside the floor image area, then to canvas-space.
    const p = worldToPixel(s.x, s.z, bounds, lb.dw, lb.dh);
    const anchorX = lb.dx + p.px;
    const anchorY = lb.dy + p.py;

    // Closest margin edge by raw distance from anchor.
    const dTop    = anchorY;
    const dBottom = H - anchorY;
    const dLeft   = anchorX;
    const dRight  = W - anchorX;
    const closest = Math.min(dTop, dBottom, dLeft, dRight);

    const textW = ctx.measureText(s.label).width;
    const boxW  = Math.ceil(textW + padInner * 2);

    let sx: number, sy: number;
    // Manual placement: `angle` (deg cw from up) + `length` (px) place the
    // sticker centre at a specific point relative to the anchor. Used by the
    // admin/floor-stickers tool to give authors pixel-precise control.
    // Auto-placement (when either is missing) snaps to the nearest edge.
    if (typeof s.angle === "number" && typeof s.length === "number") {
      const rad = (s.angle * Math.PI) / 180;
      // Leader length scales with canvas size too — authored on the desktop
      // map, so mobile gets a proportionally shorter leader to keep the same
      // "distance from anchor" feel.
      const lenScaled = s.length * scale;
      const cxS = anchorX + lenScaled * Math.sin(rad);
      // Canvas Y grows downward, so up (angle=0) is -Y.
      const cyS = anchorY - lenScaled * Math.cos(rad);
      sx = cxS - boxW / 2;
      sy = cyS - boxH / 2;
    } else if (closest === dTop) {
      sx = anchorX - boxW / 2;
      sy = edgeGap;
    } else if (closest === dBottom) {
      sx = anchorX - boxW / 2;
      sy = H - boxH - edgeGap;
    } else if (closest === dLeft) {
      sx = edgeGap;
      sy = anchorY - boxH / 2;
    } else {
      sx = W - boxW - edgeGap;
      sy = anchorY - boxH / 2;
    }
    // Clamp so the box stays fully inside the canvas even when the anchor
    // is near a perpendicular edge (e.g. a top-margin sticker tracking a
    // far-left anchor would otherwise spill off the left).
    sx = Math.max(edgeGap, Math.min(W - boxW - edgeGap, sx));
    sy = Math.max(edgeGap, Math.min(H - boxH - edgeGap, sy));

    // Leader line: anchor → nearest point on the sticker rect border.
    const lineX = Math.max(sx, Math.min(sx + boxW, anchorX));
    const lineY = Math.max(sy, Math.min(sy + boxH, anchorY));
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(lineX, lineY);
    ctx.strokeStyle = STICKER_LINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sticker rect (rounded). Corner radius scales with canvas (`radius` above).
    const r = radius;
    ctx.beginPath();
    ctx.moveTo(sx + r, sy);
    ctx.lineTo(sx + boxW - r, sy);
    ctx.quadraticCurveTo(sx + boxW, sy, sx + boxW, sy + r);
    ctx.lineTo(sx + boxW, sy + boxH - r);
    ctx.quadraticCurveTo(sx + boxW, sy + boxH, sx + boxW - r, sy + boxH);
    ctx.lineTo(sx + r, sy + boxH);
    ctx.quadraticCurveTo(sx, sy + boxH, sx, sy + boxH - r);
    ctx.lineTo(sx, sy + r);
    ctx.quadraticCurveTo(sx, sy, sx + r, sy);
    ctx.closePath();
    ctx.fillStyle   = STICKER_BG;
    ctx.fill();

    ctx.fillStyle = STICKER_TEXT;
    ctx.textAlign = "center";
    ctx.fillText(s.label, sx + boxW / 2, sy + boxH / 2 + 0.5);
  }

  ctx.restore();
}

// ── Navigation path + destination marker ──────────────────────────────────
// Drawn like a Google-Maps route: a darker-blue casing under a brighter-blue
// core (rounded caps/joins), an ETA pill sitting on the line, and a blue
// destination dot. `label` (e.g. "3 min") is the maps-style time-to-arrive.
export function drawPath(
  ctx: CanvasRenderingContext2D,
  pathPts: { x: number; z: number }[],
  playerPos: { x: number; z: number },
  bounds: MinimapData["bounds"],
  W: number,
  H: number,
  markerScale?: number,
  label?: string,
) {
  if (!pathPts.length) return;

  // `markerScale` (when given) keeps the route a small, fixed thickness
  // regardless of the (now full-screen) canvas — Google-Maps style — instead
  // of scaling up with the map.
  const scale = markerScale ?? W / DEFAULT_MAP_SIZE;

  // Build the pixel polyline once (player → waypoints).
  const px: number[] = [];
  const py: number[] = [];
  const start = worldToPixel(playerPos.x, playerPos.z, bounds, W, H);
  px.push(start.px);
  py.push(start.py);
  for (const wp of pathPts) {
    const p = worldToPixel(wp.x, wp.z, bounds, W, H);
    px.push(p.px);
    py.push(p.py);
  }

  const stroke = () => {
    ctx.beginPath();
    ctx.moveTo(px[0], py[0]);
    for (let i = 1; i < px.length; i++) ctx.lineTo(px[i], py[i]);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Casing (darker, wider) then bright core on top.
  ctx.strokeStyle = ROUTE_CASING;
  ctx.lineWidth = Math.max(1.2, navConfig.minimap.casingWidthPx * scale);
  stroke();
  ctx.strokeStyle = PATH_COLOR;
  ctx.lineWidth = Math.max(0.8, navConfig.minimap.coreWidthPx * scale);
  stroke();
  ctx.restore();

  // Destination red pin (tip on the point) — matches the maps reference.
  drawDestPin(ctx, px[px.length - 1], py[py.length - 1], scale);

  // ETA pill on the route — placed at the polyline's length-midpoint.
  if (label) drawRoutePill(ctx, px, py, label, scale);
}

// Destination "stop" marker — mirrors the 3D pin (a sphere head floating over a
// downward cone whose tip rests on the point), instead of the old flat teardrop,
// so the map and the 3D scene read as the same marker.
function drawDestPin(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const red = navConfig.color.destRed; // same red the 3D pin + ring use
  const headR = Math.max(2.5, navConfig.minimap.destPinHeadPx * scale); // sphere head radius
  const coneH = headR * 2.0;   // cone height (tip → base)
  const coneHW = headR * 0.62; // cone half-width at the base
  const cy = y - coneH - headR * 0.7; // sphere head centre, floating above the cone
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.fillStyle = red;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(0.7, 1.4 * scale);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetY = 1.5 * scale;

  // Downward cone — apex (tip) on the point, base up under the head.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - coneHW, y - coneH);
  ctx.lineTo(x + coneHW, y - coneH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sphere head — filled circle floating above the cone.
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.arc(x, cy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Soft top-left highlight so the head reads as a 3D sphere.
  ctx.beginPath();
  ctx.arc(x - headR * 0.32, cy - headR * 0.34, headR * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fill();
  ctx.restore();
}

// Rounded "time" pill sitting on the route at its mid-length point.
function drawRoutePill(
  ctx: CanvasRenderingContext2D,
  px: number[],
  py: number[],
  label: string,
  scale: number,
) {
  // Total length + midpoint along the polyline.
  let total = 0;
  for (let i = 1; i < px.length; i++) total += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  let target = total / 2;
  let mx = px[0];
  let my = py[0];
  for (let i = 1; i < px.length; i++) {
    const seg = Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    if (seg >= target) {
      const t = seg === 0 ? 0 : target / seg;
      mx = px[i - 1] + (px[i] - px[i - 1]) * t;
      my = py[i - 1] + (py[i] - py[i - 1]) * t;
      break;
    }
    target -= seg;
  }

  const fontPx = Math.max(9, Math.round(navConfig.minimap.pillFontPx * scale));
  ctx.save();
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = Math.max(5, 7 * scale);
  const boxH = Math.max(14, 18 * scale);
  const boxW = Math.ceil(ctx.measureText(label).width + padX * 2);
  const r = boxH / 2;
  const bx = mx - boxW / 2;
  const by = my - boxH / 2;

  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + boxW - r, by);
  ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
  ctx.lineTo(bx + boxW, by + boxH - r);
  ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
  ctx.lineTo(bx + r, by + boxH);
  ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fillStyle = ROUTE_PILL_BG;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetY = 1 * scale;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = ROUTE_PILL_TEXT;
  ctx.fillText(label, mx, my + 0.5);
  ctx.restore();
}

// ── destination hotspots (label destinations) ─────────────────────────────────────
// Drawn in image-relative space (same as the player/path), each as a dot + a
// small pill showing the name and live distance. The selected hotspot is cyan.
export interface MapHotspot {
  id: string;
  name: string;
  x: number;
  z: number;
  distLabel: string;
  /** false = dot only, no name pill (secondary pins of a multi-hotspot destination —
   *  only its first pin carries the label so 8 restrooms ≠ 8 pills). */
  labeled?: boolean;
  /** List-mode (memorial): the destination's number, drawn INSIDE the dot and
   *  matching its row in the destination list below the plan. */
  num?: number;
  /** The player is standing at this destination → green "You're here" dot. */
  here?: boolean;
  /** Heat-map tint for the dot (red/yellow/green by crowd level) — destinations
   *  with an authored crowd tier colour their pin like a congestion heat map. */
  crowdColor?: string;
}

export function drawHotspots(
  ctx: CanvasRenderingContext2D,
  hotspots: MapHotspot[],
  bounds: MinimapData["bounds"],
  W: number,
  H: number,
  scale: number,
  selectedId: string | null,
  /** List-mode (memorial): NUMBERED dots only — no leader lines / name pills
   *  (names live in the destination list under the plan instead). */
  numbered = false,
  /** Current map zoom. Everything here is drawn under the pan+zoom transform,
   *  so sizes are divided by this to keep markers a CONSTANT screen size —
   *  zooming in then spreads the dots apart instead of magnifying the pile-up. */
  zoom = 1,
) {
  if (!hotspots.length) return;

  if (numbered) {
    ctx.save();
    const rr = Math.max(5, 6.5 * scale) / zoom;
    const fontPx = Math.max(7, Math.round(7.5 * scale)) / zoom;
    ctx.font = `700 ${fontPx}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Selected drawn last so its ring sits on top.
    const ordered = [...hotspots].sort((a, b) =>
      (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));

    // Declutter: relax overlapping dots apart so a tight cluster (e.g. a row
    // of restrooms) renders as distinct tangent dots instead of a blob. The
    // plan is non-interactive in list-mode, so the small positional nudge
    // never has to match a click hit-test. Nudges shrink as the user zooms in
    // (distances grow in screen space while the dots stay fixed-size).
    const pts = ordered.map((h) => {
      const { px, py } = worldToPixel(h.x, h.z, bounds, W, H);
      return { h, px, py };
    });
    const minDist = rr * 2 + (1.5 * scale) / zoom;
    for (let iter = 0; iter < 8; iter++) {
      let movedAny = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          let dx = b.px - a.px, dy = b.py - a.py;
          let d = Math.hypot(dx, dy);
          if (d >= minDist) continue;
          if (d < 1e-3) { dx = 1; dy = 0; d = 1; } // coincident → split sideways
          const push = (minDist - d) / 2;
          a.px -= (dx / d) * push; a.py -= (dy / d) * push;
          b.px += (dx / d) * push; b.py += (dy / d) * push;
          movedAny = true;
        }
      }
      if (!movedAny) break;
    }
    for (const p of pts) {
      p.px = Math.max(rr, Math.min(W - rr, p.px));
      p.py = Math.max(rr, Math.min(H - rr, p.py));
    }

    for (const { h, px, py } of pts) {
      const sel = h.id === selectedId;
      const rad = sel ? rr * 1.18 : rr;
      if (sel) {
        ctx.beginPath();
        ctx.arc(px, py, rad + (4 * scale) / zoom, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,132,255,0.3)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      // Selected = blue; standing AT = green "You're here"; the rest dark.
      // Crowd tier is NOT a pin tint — it's the small badge dot below, so the
      // numbered pins stay uniform and the digits always read white-on-dark.
      ctx.fillStyle = sel ? "#0a84ff" : h.here ? "#30d158" : "rgba(22,22,24,0.9)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1.2, 1.6 * scale) / zoom;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = (5 * scale) / zoom;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.stroke();
      if (h.num != null) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(String(h.num), px, py + 0.5);
      }
      // NOTE: no crowd badge on the map pins — the tier reads as dot + word
      // ("Moderate" / "Heavy") beside each item in the "N on map" list instead,
      // matching the overlay lists.
    }
    ctx.restore();
    return;
  }

  ctx.save();
  // Same constant-screen-size treatment as the numbered branch: divide every
  // pixel dimension by `zoom` so zooming in separates the dots/pills instead
  // of magnifying the overlap.
  const fontPx = Math.max(8, Math.round(9 * scale)) / zoom;
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  const r = Math.max(3, 4 * scale) / zoom;
  const boxH = Math.max(14, 17 * scale) / zoom;
  const padX = Math.max(5, 7 * scale) / zoom;
  const leader = Math.max(12, 16 * scale) / zoom; // vertical line from dot → pill

  // Project every hotspot to pixels once.
  const dots = hotspots.map((h) => {
    const { px, py } = worldToPixel(h.x, h.z, bounds, W, H);
    return { h, px, py };
  });

  // ── Pass 1: dots (small white markers; selected = cyan) ───────────────────
  for (const { h, px, py } of dots) {
    const sel = h.id === selectedId;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#22d3ee" : "#ffffff";
    ctx.strokeStyle = "rgba(9,11,15,0.85)";
    ctx.lineWidth = Math.max(1, 1.2 * scale) / zoom;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = (4 * scale) / zoom;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
  }

  // ── Pass 2: leader line + dark name pill (design: dot — thin vertical dash
  //    up — rounded dark pill with the white name; no number badge). Labels
  //    that would OVERLAP an already-placed pill get a progressively LONGER
  //    leader, so nearby names stack at different heights instead of colliding.
  //    Selected pill drawn last so it sits on top. ─────────────────────────────
  type Rect = { x: number; y: number; w: number; h: number };
  const placed: Rect[] = [];
  const hits = (x: number, y: number, w: number, hh: number) =>
    placed.some((p) => x < p.x + p.w && x + w > p.x && y - 2 < p.y + p.h && y + hh + 2 > p.y);
  const order = [...dots].sort((a, b) =>
    (a.h.id === selectedId ? 1 : 0) - (b.h.id === selectedId ? 1 : 0));
  for (const { h, px, py } of order) {
    if (h.labeled === false) continue;
    const sel = h.id === selectedId;
    const text = h.name;
    ctx.textAlign = "left";
    const boxW = Math.ceil(ctx.measureText(text).width + padX * 2);
    const clampX = (x: number) => Math.max(2, Math.min(W - boxW - 2, x));
    const step = boxH + 4;

    // Candidates: upward with an ever-longer leader, then downward fallback.
    let bx = clampX(px - boxW / 2);
    let by = py - r - leader - boxH;
    let lineEndY = py - r - leader;
    let up = true;
    let found = false;
    for (let i = 0; i < 8 && !found; i++) {
      const endY = py - r - leader - i * step;
      const y = endY - boxH;
      if (y < 2) break;
      if (!hits(clampX(px - boxW / 2), y, boxW, boxH)) {
        bx = clampX(px - boxW / 2); by = y; lineEndY = endY; up = true; found = true;
      }
    }
    for (let i = 0; i < 8 && !found; i++) {
      const endY = py + r + leader + i * step;
      if (endY + boxH > H - 2) break;
      if (!hits(clampX(px - boxW / 2), endY, boxW, boxH)) {
        bx = clampX(px - boxW / 2); by = endY; lineEndY = endY; up = false; found = true;
      }
    }
    placed.push({ x: bx, y: by, w: boxW, h: boxH });

    ctx.beginPath();
    ctx.moveTo(px, up ? py - r : py + r);
    ctx.lineTo(px, lineEndY);
    ctx.strokeStyle = sel ? "#22d3ee" : "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1, 1.2 * scale) / zoom;
    ctx.stroke();
    const rad = boxH / 2;
    ctx.beginPath();
    ctx.moveTo(bx + rad, by);
    ctx.lineTo(bx + boxW - rad, by);
    ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + rad);
    ctx.lineTo(bx + boxW, by + boxH - rad);
    ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - rad, by + boxH);
    ctx.lineTo(bx + rad, by + boxH);
    ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - rad);
    ctx.lineTo(bx, by + rad);
    ctx.quadraticCurveTo(bx, by, bx + rad, by);
    ctx.closePath();
    // Solid dark pill (reference style) — cyan when selected.
    ctx.fillStyle = sel ? "rgba(34,211,238,0.94)" : "rgba(20,22,27,0.95)";
    ctx.fill();
    ctx.fillStyle = sel ? "#06212a" : "#ffffff";
    ctx.fillText(text, bx + padX, by + boxH / 2 + 0.5);
  }
  ctx.restore();
}

// ── Player FOV cone + position dot ────────────────────────────────────────
export function drawPlayerFOV(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; z: number },
  rotY: number,
  bounds: MinimapData["bounds"],
  W: number,
  H: number,
  markerScale?: number,
) {
  const { px, py } = worldToPixel(pos.x, pos.z, bounds, W, H);
  // `markerScale` (when given) keeps the player dot + FOV cone a small, fixed
  // size on the full-screen map (Google-Maps style) rather than scaling up.
  const scale = markerScale ?? W / DEFAULT_MAP_SIZE;
  const scaledFovLen = FOV_LENGTH * scale;
  const scaledPlayerSize = PLAYER_SIZE * scale;
  const strokeWidth = Math.max(0.7, 1.5 * scale);

  ctx.save();
  ctx.translate(px, py);
  // The cone is drawn pointing up in local space. The plan is rotated 180 on
  // export and its bounds are plain to match, so screen X runs WITH world X and
  // screen Y with world Z, and a yaw of `rotY` (forward `(-sin, -cos)`) lands at
  // `-rotY`. It was `PI - rotY` under the un-rotated pair; leaving it there
  // points the cone backwards.
  ctx.rotate(-rotY);

  // FOV gradient cone
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, scaledFovLen);
  grad.addColorStop(0,   "rgba(0,229,255,0.9)");
  grad.addColorStop(0.5, "rgba(0,229,255,0.4)");
  grad.addColorStop(1,   "rgba(0,229,255,0)");
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, scaledFovLen, -Math.PI / 2 - FOV_ANGLE / 2, -Math.PI / 2 + FOV_ANGLE / 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Edge lines
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-FOV_ANGLE / 2) * scaledFovLen, -Math.cos(-FOV_ANGLE / 2) * scaledFovLen);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin( FOV_ANGLE / 2) * scaledFovLen, -Math.cos( FOV_ANGLE / 2) * scaledFovLen);
  ctx.strokeStyle = "rgba(0,229,255,0.6)";
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  // Player dot
  ctx.beginPath();
  ctx.arc(0, 0, scaledPlayerSize, 0, Math.PI * 2);
  ctx.fillStyle = PLAYER_FILL;
  ctx.shadowColor = PLAYER_FILL;
  ctx.shadowBlur = 14 * scale;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = PLAYER_STROKE;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  ctx.restore();
}

// ── Click ripple marker ────────────────────────────────────────────────────
export function drawClickMarker(
  ctx: CanvasRenderingContext2D,
  marker: { px: number; py: number; alpha: number },
  scale: number = 1,
) {
  ctx.globalAlpha = marker.alpha;
  ctx.beginPath();
  ctx.arc(marker.px, marker.py, Math.max(2, 7 * scale), 0, Math.PI * 2);
  ctx.strokeStyle = CLICK_MARKER;
  ctx.lineWidth = Math.max(0.7, 2 * scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
