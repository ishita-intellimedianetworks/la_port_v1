"use client";

/**
 * Site-image calibration maths.
 *
 * The site image (a north-up aerial) has no world coordinates of its own. The
 * model render does — exactly, because it came out of a known ortho frustum.
 * So we align the two PICTURES, and the site image's world rect falls out
 * arithmetically from where the render landed on it.
 *
 * Both images share the runtime's flipped convention: world X and Z DECREASE
 * as pixel X and Y increase (see render-floor.ts). Hence pixel 0 maps to the
 * world maximum, not the minimum.
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

  // World at site-image pixel 0 and at pixel siteW/siteH. Inside the overlay,
  // pixel ox maps to maxX and pixel ox+ow maps to minX, so extrapolate out.
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

/**
 * Starting placement: centre the render on the site image at the scale implied
 * by a guessed metres-per-pixel. Calibration then only has to nudge, which is
 * far easier than finding the terminal from nothing.
 */
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

/** The block to paste into site.json. */
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
