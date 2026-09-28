"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Destination } from "@/shared/types";
import type { PlayerControllerHandle } from "../../scene/player";
import { etaSeconds, fmtEta, fmtMeters } from "../nav-hud/format";
import { navConfig } from "../../navigation-config";

export interface DestinationRow {
  dest: Destination;
  meters: number | null;
  distLabel: string;
  etaLabel: string;
}

const DEST_METERS_PER_UNIT = navConfig.logic.displayMetersPerUnit;

const CACHE_CELL = 3;

interface RowCache {
  posKey: string;
  dests: Destination[];
  rows: DestinationRow[];
}

export function useDestinations(
  dests: Destination[],
  ctrlRef: RefObject<PlayerControllerHandle | null>,
  active: boolean,
  fromTeleportOnly = false,
): { rows: DestinationRow[]; refresh: () => void } {
  const [rows, setRows] = useState<DestinationRow[]>([]);
  const runIdRef = useRef(0);
  const cacheRef = useRef<RowCache | null>(null);

  const posKey = useCallback((): string => {
    const p = ctrlRef.current?.getPosition();
    return p ? `${Math.round(p.x / CACHE_CELL)},${Math.round(p.z / CACHE_CELL)}` : "";
  }, [ctrlRef]);

  const computeRows = useCallback((): DestinationRow[] | null => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return null;

    const walkAllowed = (dest: Destination) =>
      !!dest.camera && !dest.teleportOnly && !fromTeleportOnly;

    const walkableIdx: number[] = [];
    const targets: { x: number; eyeY: number; z: number }[] = [];
    dests.forEach((dest, i) => {
      if (walkAllowed(dest) && dest.camera) {
        walkableIdx.push(i);
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

    const key = posKey();
    const c = cacheRef.current;
    if (c && key && c.posKey === key && c.dests === dests) {
      setRows(c.rows);
      return;
    }

    setRows(dests.map((dest) => ({ dest, meters: null, distLabel: "…", etaLabel: "" })));
    setTimeout(() => {
      if (runId !== runIdRef.current) return;
      const out = computeRows();
      if (!out) return;
      cacheRef.current = { posKey: posKey(), dests, rows: out };
      setRows(out);
    }, 0);
  }, [dests, posKey, computeRows]);

  useEffect(() => {
    if (active) refresh();
    else runIdRef.current++;
  }, [active, refresh]);

  useEffect(() => {
    if (active || !dests.length) return;
    const t = setTimeout(() => {
      const key = posKey();
      if (!key) return;
      const c = cacheRef.current;
      if (c && c.posKey === key && c.dests === dests) return;
      const out = computeRows();
      if (out) cacheRef.current = { posKey: posKey(), dests, rows: out };
    }, 800);
    return () => clearTimeout(t);
  }, [active, dests, posKey, computeRows]);

  return { rows, refresh };
}
