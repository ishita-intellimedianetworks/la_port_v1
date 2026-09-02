"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Destination } from "@/shared/types";
import type { PlayerControllerHandle } from "../../scene/player";
import { etaSeconds, fmtEta, fmtMeters } from "../nav-hud/format";
import { navConfig } from "../../navigation-config";

export interface DestinationRow {
  dest: Destination;
  /** Real-world metres along the navmesh, or null when unreachable. */
  meters: number | null;
  distLabel: string;
  etaLabel: string;
}

// World-unit → metre conversion for distance/ETA display. Single source in
// nav-config (the whole site ≈ 10 km), shared with the turn HUD so all readouts
// agree.
const DEST_METERS_PER_UNIT = navConfig.logic.displayMetersPerUnit;

// Distances are cached against the player's position quantised to this cell
// size — reopening the sheet without meaningfully moving reuses the last
// measured rows verbatim. 3 world units ≈ a few display-metres of drift, well
// inside the labels' rounding.
const CACHE_CELL = 3;

interface RowCache {
  posKey: string;
  dests: Destination[];
  rows: DestinationRow[];
}

/**
 * Computes per-destination navmesh distance + walking ETA from the player's
 * current position, sorted nearest-first (unreachable last).
 *
 * All destinations are measured in ONE batch call (measurePathsTo — a single
 * Dijkstra pass over the navmesh settles every target), so the whole sheet
 * fills at once instead of row-by-row. Results are cached by player position
 * and pre-warmed while the sheet is CLOSED (shortly after spawn and after each
 * close), so opening it is typically an instant cache hit.
 */
export function useDestinations(
  dests: Destination[],
  ctrlRef: RefObject<PlayerControllerHandle | null>,
  active: boolean,
  /** The player is standing at a teleport-only spot — every destination
   *  becomes teleport-only, so skip all measures. */
  fromTeleportOnly = false,
): { rows: DestinationRow[]; refresh: () => void } {
  const [rows, setRows] = useState<DestinationRow[]>([]);
  // Bumped to cancel an in-flight deferred measure (new refresh / sheet closed).
  const runIdRef = useRef(0);
  const cacheRef = useRef<RowCache | null>(null);

  const posKey = useCallback((): string => {
    const p = ctrlRef.current?.getPosition();
    return p ? `${Math.round(p.x / CACHE_CELL)},${Math.round(p.z / CACHE_CELL)}` : "";
  }, [ctrlRef]);

  // Measure every destination in one batch and return the sorted rows, or
  // null when the controller isn't mounted yet.
  const computeRows = useCallback((): DestinationRow[] | null => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return null;

    const walkAllowed = (dest: Destination) =>
      !!dest.camera && !dest.teleportOnly && !fromTeleportOnly;

    // Teleport-only destinations (authored flag) have no walking route by
    // definition — skip their measure entirely. Same when the player is
    // currently AT a teleport-only spot (no walking OUT of it).
    const walkableIdx: number[] = [];
    const targets: { x: number; eyeY: number; z: number }[] = [];
    dests.forEach((dest, i) => {
      if (walkAllowed(dest) && dest.camera) {
        walkableIdx.push(i);
        // eyeY → measure to the destination's authored LEVEL. Without it a
        // multi-level venue measures to whatever node sits nearest the
        // PLAYER's height at that XZ — often the floor above/below the spot.
        targets.push({ x: dest.camera.position[0], eyeY: dest.camera.position[1], z: dest.camera.position[2] });
      }
    });

    const measured = targets.length ? ctrl.measurePathsTo(targets) : [];
    const metersByDest = new Map<number, number>();
    walkableIdx.forEach((destI, j) => {
      const wu = measured[j];
      if (wu != null) metersByDest.set(destI, wu * DEST_METERS_PER_UNIT);
    });

    const out: DestinationRow[] = dests.map((dest, i) => {
      const meters = metersByDest.get(i) ?? null;
      if (meters == null) return { dest, meters: null, distLabel: "—", etaLabel: "" };
      return {
        dest,
        meters,
        distLabel: fmtMeters(meters),
        etaLabel: fmtEta(etaSeconds(meters / DEST_METERS_PER_UNIT, DEST_METERS_PER_UNIT)),
      };
    });
    out.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    return out;
  }, [dests, ctrlRef, fromTeleportOnly]);

  const refresh = useCallback(() => {
    const runId = ++runIdRef.current;

    // Instant path: the pre-warmed (or previous-open) cache is still valid.
    const key = posKey();
    const c = cacheRef.current;
    if (c && key && c.posKey === key && c.dests === dests) {
      setRows(c.rows);
      return;
    }

    // Cache miss — show every row immediately (distance pending), then fill
    // them all in one deferred batch measure (single Dijkstra, ~a frame).
    setRows(dests.map((dest) => ({ dest, meters: null, distLabel: "…", etaLabel: "" })));
    setTimeout(() => {
      if (runId !== runIdRef.current) return; // superseded or sheet closed
      const out = computeRows();
      if (!out) return;
      cacheRef.current = { posKey: posKey(), dests, rows: out };
      setRows(out);
    }, 0);
  }, [dests, posKey, computeRows]);

  useEffect(() => {
    if (active) refresh();
    else runIdRef.current++; // cancel an in-flight measure when the sheet closes
  }, [active, refresh]);

  // Pre-warm: while the sheet is closed, measure once in the background —
  // shortly after spawn AND after each close (the player usually walked
  // somewhere in between). The next open then hits the cache instantly.
  useEffect(() => {
    if (active || !dests.length) return;
    const t = setTimeout(() => {
      const key = posKey();
      if (!key) return; // controller not mounted yet
      const c = cacheRef.current;
      if (c && c.posKey === key && c.dests === dests) return; // still fresh
      const out = computeRows();
      if (out) cacheRef.current = { posKey: posKey(), dests, rows: out };
    }, 800);
    return () => clearTimeout(t);
  }, [active, dests, posKey, computeRows]);

  return { rows, refresh };
}
