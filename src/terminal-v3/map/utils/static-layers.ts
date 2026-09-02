import type { ImageRect } from "./draw";

/**
 * The map's two STATIC layers (context aerial + terminal plan), pre-composited
 * at the exact device scale they are shown at, so the frame loop blits instead
 * of rescaling.
 *
 * WHY THIS EXISTS
 * ---------------
 * The loop used to call `drawImage` on both sources every frame with
 * `imageSmoothingQuality = "high"`. The plan is 3514×4080 — 14.3 megapixels —
 * and lands in roughly 1 megapixel of backing store, so every single frame paid
 * for a 13× area downscale with the expensive filter, and the aerial added
 * another 3.7 Mpx source on top. That ran at 60 fps for the whole first-person
 * session, and it is what made dragging the map, and everything else sharing
 * the main thread with it, feel heavy.
 *
 * Nothing about the RESULT changes. The cache is built at `dpr × zoom`, which
 * is precisely the scale the blit consumes it at, so the composited pixels are
 * the same ones the old path produced — see `exact` below, which is what keeps
 * that promise honest rather than assumed.
 *
 * WHAT INVALIDATES IT
 * -------------------
 *   pan   nothing, while the view stays inside the cached margin. This is the
 *         common case and the one that mattered most: a drag is now a blit.
 *   zoom  a rebuild, but only once the scale has drifted past ~20%, so a pinch
 *         costs a handful of rebuilds rather than one per frame.
 *   rest  one rebuild at the exact scale, the frame after the view stops, so
 *         what you are left looking at is never the approximate version.
 *
 * A rebuild costs about what ONE old frame cost, and now happens a few times a
 * gesture instead of sixty times a second.
 */

export interface StaticLayerInput {
  plan: HTMLImageElement | null;
  /** Where the plan goes, in logical canvas px (the letterbox rect). */
  planRect: ImageRect | null;
  base: HTMLImageElement | null;
  /** Where the aerial goes, in the same logical px. Null = no context layer. */
  baseRect: ImageRect | null;
}

export interface StaticLayerView {
  /** Canvas size in logical (CSS) px. */
  w: number;
  h: number;
  dpr: number;
  zoom: number;
  ox: number;
  oy: number;
}

/**
 * How much beyond the visible rect to cache, as a fraction of it. Every pan
 * shorter than this is free; the cost of a larger one is a single rebuild.
 * Squared, it is also the memory multiplier over the canvas, which is why it is
 * modest rather than generous.
 */
const MARGIN = 0.18;

/**
 * Ceiling on cache pixels. Reached only at high zoom on a large canvas; past it
 * the cache scale is reduced rather than the allocation growing, so the worst
 * case is a slightly soft frame, never a memory spike. 8 Mpx ≈ 32 MB RGBA.
 */
const MAX_PX = 8_000_000;
const MAX_PX_LOW_POWER = 4_000_000;

/** Scale drift tolerated before rebuilding mid-gesture. */
const SCALE_LO = 0.8;
const SCALE_HI = 1.25;

type Cov = { x: number; y: number; w: number; h: number };

function rectKey(r: ImageRect | null) {
  return r ? `${r.dx.toFixed(2)},${r.dy.toFixed(2)},${r.dw.toFixed(2)},${r.dh.toFixed(2)}` : "-";
}

export function createStaticLayers(lowPower = false) {
  const budget = lowPower ? MAX_PX_LOW_POWER : MAX_PX;
  let c: HTMLCanvasElement | null = null;
  let cx: CanvasRenderingContext2D | null = null;
  let cov: Cov | null = null;
  /** Device px per logical px the cache was built at. */
  let scale = 0;
  /** Identity of what was drawn INTO it — sources and their placement. */
  let key = "";
  /** Was the last build at the exact scale the view wanted? Drives the settle
   *  rebuild: an approximate cache is refreshed as soon as the view stops. */
  let exact = false;
  let lastView = "";

  function build(src: StaticLayerInput, want: Cov, s: number) {
    const pxW = Math.max(1, Math.round(want.w * s));
    const pxH = Math.max(1, Math.round(want.h * s));
    if (!c) {
      c = document.createElement("canvas");
      cx = c.getContext("2d");
    }
    if (!cx) return false;
    if (c.width !== pxW || c.height !== pxH) {
      c.width = pxW;
      c.height = pxH;
    } else {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, pxW, pxH);
    }
    // Map the covered logical rect onto the cache's pixels, so both layers can
    // be drawn with the very same rects the frame loop would have used.
    cx.setTransform(s, 0, 0, s, -want.x * s, -want.y * s);
    // The expensive filter belongs HERE — once per rebuild — and not on the
    // per-frame blit, which is 1:1 and has nothing to interpolate.
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    if (src.base && src.baseRect) {
      const r = src.baseRect;
      cx.drawImage(src.base, r.dx, r.dy, r.dw, r.dh);
    }
    if (src.plan && src.planRect) {
      const r = src.planRect;
      cx.drawImage(src.plan, r.dx, r.dy, r.dw, r.dh);
    }
    cov = want;
    scale = s;
    return true;
  }

  return {
    /**
     * Paint the static layers for this frame. Call INSIDE the loop's pan/zoom
     * transform — the rect handed to `drawImage` is in the same logical pixels
     * every other overlay uses.
     */
    draw(ctx: CanvasRenderingContext2D, src: StaticLayerInput, v: StaticLayerView) {
      if (!src.plan || !src.planRect) return;

      const p = src.planRect;
      const b = src.baseRect;
      const ux0 = b ? Math.min(p.dx, b.dx) : p.dx;
      const uy0 = b ? Math.min(p.dy, b.dy) : p.dy;
      const ux1 = b ? Math.max(p.dx + p.dw, b.dx + b.dw) : p.dx + p.dw;
      const uy1 = b ? Math.max(p.dy + p.dh, b.dy + b.dh) : p.dy + p.dh;

      const vx0 = (0 - v.ox) / v.zoom;
      const vy0 = (0 - v.oy) / v.zoom;
      const vx1 = (v.w - v.ox) / v.zoom;
      const vy1 = (v.h - v.oy) / v.zoom;

      const mx = (vx1 - vx0) * MARGIN;
      const my = (vy1 - vy0) * MARGIN;
      const want: Cov = {
        x: Math.max(ux0, vx0 - mx),
        y: Math.max(uy0, vy0 - my),
        w: 0,
        h: 0,
      };
      want.w = Math.min(ux1, vx1 + mx) - want.x;
      want.h = Math.min(uy1, vy1 + my) - want.y;
      if (!(want.w > 0) || !(want.h > 0)) return;

      const ideal = v.dpr * v.zoom;
      const cap = Math.sqrt(budget / (want.w * want.h));
      const s = Math.min(ideal, cap);
      const wantExact = s >= ideal - 1e-6;

      const nextKey =
        `${src.plan.src}|${src.base?.src ?? "-"}|${rectKey(src.planRect)}|${rectKey(src.baseRect)}`;
      // "The view has not moved since last frame" — the cue to spend one
      // rebuild getting back to exact after a gesture ends.
      const viewKey = `${v.w}x${v.h}@${v.dpr}|${v.zoom}|${v.ox}|${v.oy}`;
      const settled = viewKey === lastView;
      lastView = viewKey;

      const ratio = scale > 0 ? s / scale : 0;
      const stale =
        !c ||
        !cov ||
        key !== nextKey ||
        ratio < SCALE_LO ||
        ratio > SCALE_HI ||
        vx0 < cov.x - 1e-6 ||
        vy0 < cov.y - 1e-6 ||
        vx1 > cov.x + cov.w + 1e-6 ||
        vy1 > cov.y + cov.h + 1e-6 ||
        (settled && !exact && wantExact);

      if (stale) {
        if (!build(src, want, s)) return;
        key = nextKey;
        exact = wantExact;
      }
      if (!c || !cov) return;
      ctx.drawImage(c, cov.x, cov.y, cov.w, cov.h);
    },

    /** Drop the backing store — a canvas this size is worth releasing early. */
    dispose() {
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      c = null;
      cx = null;
      cov = null;
      key = "";
      scale = 0;
      exact = false;
    },
  };
}

export type StaticLayers = ReturnType<typeof createStaticLayers>;
