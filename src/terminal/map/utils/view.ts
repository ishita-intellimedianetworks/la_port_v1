/**
 * The map viewport, in world units rather than image pixels.
 *
 * Two rect shapes are kept apart on purpose:
 *   Bounds    — flipped, image-facing (minX holds the world MAX). What
 *               `worldToPixel` consumes, because plans render with cam.up = +Z.
 *   WorldRect — plain, minX < maxX. Authored, and used for fit maths.
 *
 * `viewBounds()` bridges them: it returns the flipped Bounds describing what the
 * canvas shows, so every painter in draw.ts keeps its `(bounds, W, H)` signature.
 */

import type { MinimapData } from "../types";

type Bounds = MinimapData["bounds"];

export interface WorldRect {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface View {
  cx: number;
  cz: number;
  /** Metres per canvas pixel. Larger = zoomed further out. */
  mpp: number;
}

export function plainRect(b: Bounds): WorldRect {
  return {
    minX: Math.min(b.minX, b.maxX),
    maxX: Math.max(b.minX, b.maxX),
    minZ: Math.min(b.minZ, b.maxZ),
    maxZ: Math.max(b.minZ, b.maxZ),
  };
}

/** Derived so `worldToPixel(wx, wz, viewBounds(v, W, H), W, H)` gives canvas px. */
export function viewBounds(v: View, W: number, H: number): Bounds {
  return {
    minX: v.cx + (W / 2) * v.mpp,
    maxX: v.cx - (W / 2) * v.mpp,
    minZ: v.cz + (H / 2) * v.mpp,
    maxZ: v.cz - (H / 2) * v.mpp,
  };
}

/** Contain-fit: the mpp at which `r` just fits a W x H canvas. */
export function fitMpp(r: WorldRect, W: number, H: number): number {
  if (W <= 0 || H <= 0) return 1;
  return Math.max((r.maxX - r.minX) / W, (r.maxZ - r.minZ) / H);
}

export function centreOf(r: WorldRect): { cx: number; cz: number } {
  return { cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2 };
}

export function fitView(r: WorldRect, W: number, H: number): View {
  return { ...centreOf(r), mpp: fitMpp(r, W, H) };
}

export function contains(r: WorldRect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/**
 * Nearest point inside `r`.
 *
 * Every layout camera is authored in fly mode — hundreds of metres up and, in
 * this site, outside the zone entirely. The map only ever reads XZ, so height is
 * already ignored; this pins the live marker to the zone so it stays on the part
 * of the plan that is actually drawn instead of sliding off-canvas.
 */
export function clampPoint(r: WorldRect, x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(r.maxX, Math.max(r.minX, x)),
    z: Math.min(r.maxZ, Math.max(r.minZ, z)),
  };
}

/**
 * Clamps the CENTRE, not the edges: zoomed out the visible area is larger than
 * the content, and clamping edges there fights the user on every drag.
 */
export function clampView(v: View, limit: WorldRect): View {
  return {
    ...v,
    cx: Math.min(limit.maxX, Math.max(limit.minX, v.cx)),
    cz: Math.min(limit.maxZ, Math.max(limit.minZ, v.cz)),
  };
}

/** Zoom about a canvas point, holding the world under it fixed. */
export function zoomAt(
  v: View, factor: number, px: number, py: number, W: number, H: number,
  minMpp: number, maxMpp: number,
): View {
  const mpp = Math.min(maxMpp, Math.max(minMpp, v.mpp * factor));
  if (mpp === v.mpp) return v;
  const wx = v.cx - (px - W / 2) * v.mpp;
  const wz = v.cz - (py - H / 2) * v.mpp;
  return { mpp, cx: wx + (px - W / 2) * mpp, cz: wz + (py - H / 2) * mpp };
}

/** Has the view moved far enough from `home` to offer a recenter? */
export function hasDrifted(v: View, home: View): boolean {
  return Math.hypot(v.cx - home.cx, v.cz - home.cz) > home.mpp * 24
    || Math.abs(v.mpp / home.mpp - 1) > 0.02;
}

/**
 * Baked once, not `ctx.filter` per frame — the RAF loop runs continuously while
 * the map is open and filtering a 2K source every frame would dominate it.
 *
 * `grey` is separate from `brightness` because an aerial that already ships
 * stylised — terminal lit, surroundings darkened — needs almost none of either,
 * and greyscaling it would throw away the styling it came with.
 */
export function bakeDimmed(
  img: HTMLImageElement,
  brightness = 0.5,
  grey = 1,
): HTMLCanvasElement | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.filter = `grayscale(${grey}) brightness(${brightness})`;
  ctx.drawImage(img, 0, 0);
  return cv;
}
