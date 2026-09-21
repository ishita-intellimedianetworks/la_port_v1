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
    dw = innerW; dh = innerW / imgAspect;
  } else {
    dh = innerH; dw = innerH * imgAspect;
  }
  return { dx: marginX + (innerW - dw) / 2, dy: marginY + (innerH - dh) / 2, dw, dh };
}

export function contextRect(
  baseBounds: MinimapData["bounds"],
  planBounds: MinimapData["bounds"],
  lb: ImageRect,
): ImageRect | null {
  const a = worldToPixel(baseBounds.minX, baseBounds.minZ, planBounds, lb.dw, lb.dh);
  const b = worldToPixel(baseBounds.maxX, baseBounds.maxZ, planBounds, lb.dw, lb.dh);
  const dw = b.px - a.px;
  const dh = b.py - a.py;
  if (!(dw > 0) || !(dh > 0)) return null;
  return { dx: lb.dx + a.px, dy: lb.dy + a.py, dw, dh };
}

export function drawStickers(
  ctx: CanvasRenderingContext2D,
  stickers: MinimapSticker[],
  bounds: MinimapData["bounds"],
  lb: ImageRect,
  W: number,
  H: number,
) {
  if (!stickers.length) return;

  const scale = W / DEFAULT_MAP_SIZE;
  const fontPx   = Math.max(8, Math.round(8 * scale));
  const padInner = Math.max(4, Math.round(7  * scale));
  const boxH     = Math.max(11, Math.round(15 * scale));
  const edgeGap  = Math.max(2, Math.round(3  * scale));
  const radius   = boxH / 2;

  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";

  for (const s of stickers) {
    const p = worldToPixel(s.x, s.z, bounds, lb.dw, lb.dh);
    const anchorX = lb.dx + p.px;
    const anchorY = lb.dy + p.py;

    const dTop    = anchorY;
    const dBottom = H - anchorY;
    const dLeft   = anchorX;
    const dRight  = W - anchorX;
    const closest = Math.min(dTop, dBottom, dLeft, dRight);

    const textW = ctx.measureText(s.label).width;
    const boxW  = Math.ceil(textW + padInner * 2);

    let sx: number, sy: number;
    if (typeof s.angle === "number" && typeof s.length === "number") {
      const rad = (s.angle * Math.PI) / 180;
      const lenScaled = s.length * scale;
      const cxS = anchorX + lenScaled * Math.sin(rad);
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
    sx = Math.max(edgeGap, Math.min(W - boxW - edgeGap, sx));
    sy = Math.max(edgeGap, Math.min(H - boxH - edgeGap, sy));

    const lineX = Math.max(sx, Math.min(sx + boxW, anchorX));
    const lineY = Math.max(sy, Math.min(sy + boxH, anchorY));
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(lineX, lineY);
    ctx.strokeStyle = STICKER_LINE;
    ctx.lineWidth = 1;
    ctx.stroke();

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

  const scale = markerScale ?? W / DEFAULT_MAP_SIZE;

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
  ctx.strokeStyle = ROUTE_CASING;
  ctx.lineWidth = Math.max(1.2, navConfig.minimap.casingWidthPx * scale);
  stroke();
  ctx.strokeStyle = PATH_COLOR;
  ctx.lineWidth = Math.max(0.8, navConfig.minimap.coreWidthPx * scale);
  stroke();
  ctx.restore();

  drawDestPin(ctx, px[px.length - 1], py[py.length - 1], scale);

  if (label) drawRoutePill(ctx, px, py, label, scale);
}

function drawDestPin(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const red = navConfig.color.destRed;
  const headR = Math.max(2.5, navConfig.minimap.destPinHeadPx * scale);
  const coneH = headR * 2.0;
  const coneHW = headR * 0.62;
  const cy = y - coneH - headR * 0.7;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.fillStyle = red;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(0.7, 1.4 * scale);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetY = 1.5 * scale;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - coneHW, y - coneH);
  ctx.lineTo(x + coneHW, y - coneH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.arc(x, cy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x - headR * 0.32, cy - headR * 0.34, headR * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fill();
  ctx.restore();
}

function drawRoutePill(
  ctx: CanvasRenderingContext2D,
  px: number[],
  py: number[],
  label: string,
  scale: number,
) {
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
    const ordered = [...hotspots].sort((a, b) =>
      (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));

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
          if (d < 1e-3) { dx = 1; dy = 0; d = 1; }
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
    }
    ctx.restore();
    return;
  }

  ctx.save();
  const fontPx = Math.max(8, Math.round(9 * scale)) / zoom;
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  const r = Math.max(3, 4 * scale) / zoom;
  const boxH = Math.max(14, 17 * scale) / zoom;
  const padX = Math.max(5, 7 * scale) / zoom;
  const leader = Math.max(12, 16 * scale) / zoom; // vertical line from dot → pill

  const dots = hotspots.map((h) => {
    const { px, py } = worldToPixel(h.x, h.z, bounds, W, H);
    return { h, px, py };
  });

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
    ctx.fillStyle = sel ? "rgba(34,211,238,0.94)" : "rgba(20,22,27,0.95)";
    ctx.fill();
    ctx.fillStyle = sel ? "#06212a" : "#ffffff";
    ctx.fillText(text, bx + padX, by + boxH / 2 + 0.5);
  }
  ctx.restore();
}

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
  ctx.rotate(-rotY);

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

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-FOV_ANGLE / 2) * scaledFovLen, -Math.cos(-FOV_ANGLE / 2) * scaledFovLen);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin( FOV_ANGLE / 2) * scaledFovLen, -Math.cos( FOV_ANGLE / 2) * scaledFovLen);
  ctx.strokeStyle = "rgba(0,229,255,0.6)";
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

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
