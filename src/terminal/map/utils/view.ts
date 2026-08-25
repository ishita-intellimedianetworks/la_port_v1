/**
 * The map's viewport, expressed in WORLD units rather than image pixels.
 *
 * The old model anchored everything to `letterboxRef` — the rect the single
 * floor-plan image happened to be drawn into — and defined "zoom 1" as "that
 * image exactly fits". That works for one image and breaks for three: the site
 * aerial, the terminal plan and the walkable zone all cover different world
 * rects, so there is no single image to anchor to.
 *
 * Here the viewport is `{ cx, cz, mpp }` — a world centre and a metres-per-pixel
 * scale. Every layer then draws itself by asking where its own world rect lands,
 * and they register with each other automatically because they share one
 * transform.
 *
 * ── The flip ────────────────────────────────────────────────────────────────
 * Plans are rendered with `cam.up = +Z` (see admin/bounds/render-floor.ts), so
 * world X and Z DECREASE as pixel X and Y increase. `MinimapData["bounds"]`
 * encodes that by holding the world MAXIMUM in `minX`/`minZ`. This module keeps
 * two shapes apart, deliberately:
 *
 *   Bounds     — flipped, image-facing. What `worldToPixel` consumes.
 *   WorldRect  — plain, minX < maxX. What humans author and what fit maths uses.
 *
 * `viewBounds()` is the bridge: it returns the flipped Bounds describing what
 * the CANVAS currently shows, which means every existing painter in draw.ts
 * (drawPath, drawHotspots, drawPlayerFOV) keeps working untouched — they take
 * `(bounds, W, H)` and that triple now describes the viewport instead of an
 * image rect.
 */

import type { MinimapData } from "../types";

type Bounds = MinimapData["bounds"];

/** Plain world rectangle, minX < maxX. Authored, and used for fit maths. */
export interface WorldRect {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/** World centre + scale. The whole viewport state. */
export interface View {
  cx: number;
  cz: number;
  /** Metres per canvas pixel. Larger = zoomed further out. */
  mpp: number;
}

/** Flipped image bounds -> plain rect, for fit maths and containment tests. */
export function plainRect(b: Bounds): WorldRect {
  return {
    minX: Math.min(b.minX, b.maxX),
    maxX: Math.max(b.minX, b.maxX),
    minZ: Math.min(b.minZ, b.maxZ),
    maxZ: Math.max(b.minZ, b.maxZ),
  };
}

/**
 * The flipped bounds describing what the canvas shows right now.
 *
 * Derived so that `worldToPixel(wx, wz, viewBounds(v, W, H), W, H)` gives canvas
 * pixels directly:
 *
 *   px = ((wx - minX) / (maxX - minX)) * W   with   minX = cx + (W/2)·mpp
 *                                                   maxX = cx - (W/2)·mpp
 *      = W/2 - (wx - cx)/mpp
 *
 * i.e. canvas X grows as world X shrinks, which is the flip.
 */
export function viewBounds(v: View, W: number, H: number): Bounds {
  return {
    minX: v.cx + (W / 2) * v.mpp,
    maxX: v.cx - (W / 2) * v.mpp,
    minZ: v.cz + (H / 2) * v.mpp,
    maxZ: v.cz - (H / 2) * v.mpp,
  };
}

/** Contain-fit: the mpp at which `r` just fits inside a W x H canvas. */
export function fitMpp(r: WorldRect, W: number, H: number): number {
  if (W <= 0 || H <= 0) return 1;
  return Math.max((r.maxX - r.minX) / W, (r.maxZ - r.minZ) / H);
}

export function centreOf(r: WorldRect): { cx: number; cz: number } {
  return { cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2 };
}

/** The view that frames `r` in a W x H canvas. */
export function fitView(r: WorldRect, W: number, H: number): View {
  return { ...centreOf(r), mpp: fitMpp(r, W, H) };
}

export function contains(r: WorldRect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/**
 * Keep the centre inside `limit` so the map can never be panned into empty
 * space. Panning is clamped to the CENTRE rather than the edges: at the
 * zoomed-out end the visible area is larger than the content, and clamping
 * edges there would fight the user for every drag.
 */
export function clampView(v: View, limit: WorldRect): View {
  return {
    ...v,
    cx: Math.min(limit.maxX, Math.max(limit.minX, v.cx)),
    cz: Math.min(limit.maxZ, Math.max(limit.minZ, v.cz)),
  };
}

/** Zoom about a canvas point, keeping the world under it pinned. */
export function zoomAt(
  v: View, factor: number, px: number, py: number, W: number, H: number,
  minMpp: number, maxMpp: number,
): View {
  const mpp = Math.min(maxMpp, Math.max(minMpp, v.mpp * factor));
  if (mpp === v.mpp) return v;
  // World under the cursor before the change, held fixed after it.
  const wx = v.cx - (px - W / 2) * v.mpp;
  const wz = v.cz - (py - H / 2) * v.mpp;
  return { mpp, cx: wx + (px - W / 2) * mpp, cz: wz + (py - H / 2) * mpp };
}

/** True once the view has drifted far enough from `home` to offer a recenter. */
export function hasDrifted(v: View, home: View): boolean {
  const moved = Math.hypot(v.cx - home.cx, v.cz - home.cz) > home.mpp * 24;
  const scaled = Math.abs(v.mpp / home.mpp - 1) > 0.02;
  return moved || scaled;
}

/**
 * A greyscale, dimmed copy of an image, baked once.
 *
 * NOT `ctx.filter = "grayscale(1)"` per frame: the map's RAF loop runs
 * continuously while it is open, and filtering a 2K source every frame would be
 * the most expensive thing in it by a wide margin. Baking makes the dim layer
 * cost exactly one drawImage.
 */
export function bakeDimmed(img: HTMLImageElement, brightness = 0.5): HTMLCanvasElement | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.filter = `grayscale(1) brightness(${brightness})`;
  ctx.drawImage(img, 0, 0);
  return cv;
}
