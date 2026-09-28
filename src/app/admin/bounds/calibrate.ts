"use client";

import type { Bbox } from "./render-floor";

export interface Placement {
  ox: number; oy: number;
  ow: number; oh: number;
  rotDeg: number;
}

export interface RuntimeBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface CalibrationResult {
  bounds: RuntimeBounds;
  world: { minX: number; maxX: number; minZ: number; maxZ: number };
  metresPerPixelX: number;
  metresPerPixelZ: number;
  agreementPct: number;
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

  const minX = bbox.maxX + p.ox * mppX;
  const maxX = bbox.maxX - (siteW - p.ox) * mppX;
  const minZ = bbox.maxZ + p.oy * mppZ;
  const maxZ = bbox.maxZ - (siteH - p.oy) * mppZ;

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

export function planJson(bbox: Bbox, imageUrl: string, pixelW: number, pixelH: number): string {
  return JSON.stringify(
    {
      plan: {
        imageUrl,
        bounds: {
          minX: r(bbox.minX), maxX: r(bbox.maxX),
          minZ: r(bbox.minZ), maxZ: r(bbox.maxZ),
        },
      },
      _render: { pixelW, pixelH, spanMetres: { x: r(bbox.dx, 1), z: r(bbox.dz, 1) }, aspect: r(bbox.aspect, 4) },
    },
    null,
    2,
  );
}
