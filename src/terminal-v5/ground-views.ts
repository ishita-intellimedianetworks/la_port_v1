import type { Vec3 } from "@/config/schema";

export interface GroundView {
  position: Vec3;
  rotation: Vec3;
  intent: string;
  range: number;
  pitch: number;
  sunDot: number;
  walk: number;
  area: number;
}

export const GROUND_VIEW_BY_HOTSPOT: Record<string, GroundView> = {
  H04: {
    position: [-1454.5, 0.13, 307.5],
    rotation: [0, -0.4538, 0],
    intent: "The /v2 berth-quay framing, taken from ground level",
    range: 160,
    pitch: 0,
    sunDot: 0.56,
    walk: 40,
    area: 262,
  },

  H07: {
    position: [-1201.5, 0.13, -195.5],
    rotation: [0.0642, 2.5609, 0],
    intent: "The exclusion zone on the apron, crane legs above it",
    range: 16,
    pitch: 4,
    sunDot: -0.45,
    walk: 40,
    area: 283,
  },

  H13: {
    position: [-942.5, 0.13, -88.5],
    rotation: [0.2145, 2.4618, 0],
    intent: "Top handler TH-024 working the northern yard",
    range: 59,
    pitch: 12,
    sunDot: -0.36,
    walk: 40,
    area: 191,
  },

  H14: {
    position: [-1021.5, 0.13, 73.5],
    rotation: [0.2176, 2.1567, 0],
    intent: "Three-quarter on the stack face, hero box on tier 3",
    range: 29,
    pitch: 12,
    sunDot: -0.06,
    walk: 40,
    area: 123,
  },

  H18: {
    position: [-1286.5, 0.13, 465.5],
    rotation: [0.0269, 2.6593, 0],
    intent: "Across the southern yard block from the service road",
    range: 61,
    pitch: 2,
    sunDot: -0.54,
    walk: 35,
    area: 192,
  },

  H21: {
    position: [-773.5, 0.13, 225.5],
    rotation: [0.0742, -3.1377, 0],
    intent: "Down the lane at the OCR portal",
    range: 22,
    pitch: 4,
    sunDot: -0.87,
    walk: 40,
    area: 68,
  },

  H23: {
    position: [-698.5, 0.13, -362.5],
    rotation: [0.0721, -3.1344, 0],
    intent: "Sight down the loading track, train receding",
    range: 33,
    pitch: 4,
    sunDot: -0.87,
    walk: 40,
    area: 116,
  },
};

export function hasGroundView(hotspotId: string): boolean {
  return hotspotId in GROUND_VIEW_BY_HOTSPOT;
}
