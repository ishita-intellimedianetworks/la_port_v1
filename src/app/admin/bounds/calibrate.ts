"use client";

/**
 * Site-image calibration maths.
 *
 * The aerial has no world coordinates of its own; the render does, exactly,
 * because it came from a known ortho frustum. So align the two PICTURES and the
 * aerial's world rect falls out arithmetically.
 *
 * Both use the flipped convention (pixel 0 maps to the world MAXIMUM).
 */

import type { Bbox } from "./render-floor";

/** Where the model render sits on the site image, in site-image pixels. */
export interface Placement {
  ox: number; oy: number;
  ow: number; oh: number;
  /** Diagnostic only — `bounds` cannot express rotation. Non-zero means the
   *  site image needs straightening before it will ever line up. */
  rotDeg: number;
}

/** The shape `use-minimap-bounds` produces and `worldToPixel` consumes. */
export interface RuntimeBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface CalibrationResult {
  bounds: RuntimeBounds;
  /** Plain world rect, for sanity-reading. */
  world: { minX: number; maxX: number; minZ: number; maxZ: number };
  metresPerPixelX: number;
  metresPerPixelZ: number;
  /** 100 = the two scales agree exactly. Below ~98 means the alignment is off
   *  or the image is non-uniformly stretched. */
  agreementPct: number;
  /** Metres the site image spans on each axis. */
  spanX: number;
  spanZ: number;
}

export function calibrate(
  siteW: number,
  siteH: number,
  p: Placement,
  bbox: Bbox,
): CalibrationResult {
  const mppX = bbox.dx / p.ow;
  const mppZ = bbox.dz / p.oh;

  // Inside the overlay pixel ox maps to maxX and ox+ow to minX; extrapolate out.
  const minX = bbox.maxX + p.ox * mppX;                 // world at pixel x = 0
  const maxX = bbox.maxX - (siteW - p.ox) * mppX;       // world at pixel x = siteW
  const minZ = bbox.maxZ + p.oy * mppZ;                 // world at pixel y = 0
  const maxZ = bbox.maxZ - (siteH - p.oy) * mppZ;       // world at pixel y = siteH

  const ratio = mppX < mppZ ? mppX / mppZ : mppZ / mppX;

  return {
    bounds: { minX, maxX, minZ, maxZ },
    world: {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
    },
    metresPerPixelX: mppX,
    metresPerPixelZ: mppZ,
    agreementPct: ratio * 100,
    spanX: Math.abs(minX - maxX),
    spanZ: Math.abs(minZ - maxZ),
  };
}

/** Centre the render at a guessed scale, so calibration only has to nudge. */
export function initialPlacement(
  siteW: number,
  siteH: number,
  bbox: Bbox,
  guessMpp: number,
): Placement {
  const ow = bbox.dx / guessMpp;
  const oh = bbox.dz / guessMpp;
  return {
    ox: (siteW - ow) / 2,
    oy: (siteH - oh) / 2,
    ow,
    oh,
    rotDeg: 0,
  };
}

/** Scale about the placement's centre, so nudging and zooming don't fight. */
export function scalePlacement(p: Placement, factor: number): Placement {
  const cx = p.ox + p.ow / 2;
  const cy = p.oy + p.oh / 2;
  const ow = p.ow * factor;
  const oh = p.oh * factor;
  return { ...p, ow, oh, ox: cx - ow / 2, oy: cy - oh / 2 };
}

const r = (n: number, d = 3): number => {
  const k = Math.pow(10, d);
  return Math.round(n * k) / k;
};

/** The `map.site` block to paste into site.json. */
export function toJson(
  c: CalibrationResult,
  p: Placement,
  siteW: number,
  siteH: number,
  imageUrl: string,
): string {
  return JSON.stringify(
    {
      site: {
        imageUrl,
        pixels: { w: siteW, h: siteH },
        // Runtime convention: minX holds the world MAX. Feeds worldToPixel directly.
        bounds: {
          minX: r(c.bounds.minX), maxX: r(c.bounds.maxX),
          minZ: r(c.bounds.minZ), maxZ: r(c.bounds.maxZ),
        },
      },
      check: {
        metresPerPixelX: r(c.metresPerPixelX, 5),
        metresPerPixelZ: r(c.metresPerPixelZ, 5),
        agreementPct: r(c.agreementPct, 2),
        spanMetres: { x: r(c.spanX, 1), z: r(c.spanZ, 1) },
        rotationDeg: r(p.rotDeg, 2),
      },
      placement: { ox: r(p.ox, 1), oy: r(p.oy, 1), ow: r(p.ow, 1), oh: r(p.oh, 1) },
    },
    null,
    2,
  );
}

/**
 * The `map.plan` block: the render's URL plus the rect it was framed to.
 *
 * Only Z is inverted — the render is un-mirrored on export, so X reads plainly
 * here and in `map.site.bounds` alike.
 */
export function planJson(bbox: Bbox, imageUrl: string, pixelW: number, pixelH: number): string {
  return JSON.stringify(
    {
      plan: {
        imageUrl,
        bounds: {
          minX: r(bbox.minX), maxX: r(bbox.maxX),
          minZ: r(bbox.maxZ), maxZ: r(bbox.minZ),
        },
      },
      _render: { pixelW, pixelH, spanMetres: { x: r(bbox.dx, 1), z: r(bbox.dz, 1) }, aspect: r(bbox.aspect, 4) },
    },
    null,
    2,
  );
}
