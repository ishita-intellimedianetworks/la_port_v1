import type { StreamingConfig, Tier } from "@/streaming/config";

export type VrStreamView = "walk" | "dollhouse";

const VR = {
  walk: {
    nearDist: 25,
    midDist: 75,
    sharpestTier: "mid" as Tier,
    rung: { near: 256, mid: 256, far: 128 } as Record<Tier, number>,
  },
  dollhouse: {
    sharpestTier: "far" as Tier,
    rung: { near: 128, mid: 128, far: 128 } as Record<Tier, number>,
  },
} as const;

let active = false;

export function setVrStreaming(on: boolean) {
  active = on;
}

export function vrStreamingOn(): boolean {
  return active;
}

export function vrStreamConfig<C extends StreamingConfig | null>(c: C, view: VrStreamView): C {
  if (!active || !c) return c;
  const base = {
    ...c,
    transmission: "off" as const,
    adaptiveDpr: false,
    wireBudgetMB: 0,
    coarsenResident: true,
  };
  if (view === "dollhouse") {
    return {
      ...base,
      forceTier: "far",
      sharpestTier: VR.dollhouse.sharpestTier,
      texRung: { ...VR.dollhouse.rung },
    };
  }
  return {
    ...base,
    nearDist: VR.walk.nearDist,
    midDist: VR.walk.midDist,
    sharpestTier: VR.walk.sharpestTier,
    texRung: { ...VR.walk.rung },
  };
}

export const streamReach = {
  metres: Infinity,
  at: -Infinity,
};

export function publishStreamReach(metres: number) {
  streamReach.metres = metres;
  streamReach.at = performance.now();
}

export function clearStreamReach() {
  streamReach.metres = Infinity;
  streamReach.at = -Infinity;
}
