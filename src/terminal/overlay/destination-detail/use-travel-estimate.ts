"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { LAYOUT_BY_ID } from "@/config";
import { navConfig } from "../../navigation-config";
import { etaSeconds, fmtEta, fmtMeters } from "../nav-hud/format";
import type { PlayerControllerHandle } from "../../scene/player";

const METERS_PER_UNIT = navConfig.logic.displayMetersPerUnit;

export interface TravelEstimate {
  /** null while measuring, or when no walkable route exists. */
  meters: number | null;
  distLabel: string;
  etaLabel: string;
}

/**
 * Measure the walk from where the player stands to a layout's camera.
 *
 * Measured ONCE when the destination opens rather than polled: the player is
 * standing still while reading the panel, so a live figure would cost a
 * navmesh search several times a second to display the same number.
 *
 * `measurePathTo` walks the graph without moving anyone, and returns null when
 * no route exists — which is the honest answer for an aerial camera, and what
 * makes the panel show "Instant travel" instead of a fabricated time.
 */
export function useTravelEstimate(
  ctrlRef: RefObject<PlayerControllerHandle | null>,
  layoutId: string | null,
  enabled: boolean,
): TravelEstimate {
  const [estimate, setEstimate] = useState<TravelEstimate>({
    meters: null,
    distLabel: "",
    etaLabel: "",
  });

  useEffect(() => {
    const controller = ctrlRef.current;
    const layout = layoutId ? LAYOUT_BY_ID[layoutId] : null;
    if (!enabled || !controller || !layout) {
      setEstimate({ meters: null, distLabel: "", etaLabel: "" });
      return;
    }

    const [x, eyeY, z] = layout.camera.position;
    // eyeY pins the measure to the destination's authored level rather than
    // whatever node sits nearest the player's own height at that XZ.
    const units = controller.measurePathTo({ x, eyeY, z });
    if (units == null) {
      setEstimate({ meters: null, distLabel: "", etaLabel: "" });
      return;
    }

    const meters = units * METERS_PER_UNIT;
    setEstimate({
      meters,
      distLabel: fmtMeters(meters),
      etaLabel: fmtEta(etaSeconds(units, METERS_PER_UNIT)),
    });
  }, [ctrlRef, layoutId, enabled]);

  return estimate;
}
