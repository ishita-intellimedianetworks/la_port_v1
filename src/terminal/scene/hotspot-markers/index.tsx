"use client";

import { useRef, useState } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { HOTSPOT_BY_ID, LAYOUT_BY_ID, hotspots, scene } from "@/config";
import type { PlayerControllerHandle } from "../player";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { Hotspot } from "./hotspot";

interface HotspotMarkersProps {
  /** Marker disc radius in world units (FloorConfig.hsSize). */
  hsSize?: number;
  ctrlRef: RefObject<PlayerControllerHandle | null>;
  /** Nearby markers only make sense on foot — see below. */
  viewMode: "dollhouse" | "firstPerson";
}

/** How often the nearby set is recomputed. Markers appear as you approach, so
 *  a few times a second is plenty — and this runs inside useFrame, where doing
 *  it every frame would be thirty distance checks at 60fps for a set that
 *  changes every few seconds. */
const SAMPLE_MS = 250;

/**
 * Hysteresis. Without it the set oscillates.
 *
 * A resource sitting exactly on the radius flickers on and off as the player
 * breathes against the boundary, and at the cap the eighth and ninth swap
 * places on every sample. Both read as blinking markers.
 *
 * Two separate thresholds fix it. A marker must come within the radius to
 * APPEAR, but has to retreat past `radius * EXIT_SLACK` before it LEAVES, so
 * the boundary is a band rather than a line. And an already-visible marker is
 * ranked as if it were `RANK_BIAS` nearer than it is, so displacing one at the
 * cap takes a competitor that is clearly closer, not one a centimetre closer.
 */
const EXIT_SLACK = 1.3;
const RANK_BIAS = 0.8;

/**
 * The resource markers in the scene.
 *
 * Two kinds, and they are different on purpose:
 *
 *   SELECTED  the resource picked from the list — always shown, wherever the
 *             player is, and pulsing so it is findable.
 *   OWN       every resource belonging to the layout the player is standing at,
 *             regardless of distance — arriving somewhere has to show what is
 *             filed there.
 *   NEARBY    every resource within `nearbyHotspotRadius` of where the player
 *             actually stands, nearest first, capped at `nearbyHotspotMax`.
 *             First person only.
 *             Membership is NOT by layout: arriving at L06 surfaces whatever
 *             is genuinely close, including resources filed under L05 or L08,
 *             because what is in front of you is a fact about position, not
 *             about which list an ID was written on.
 *
 * Drawing all thirty at once turned the view into overlapping rings; drawing
 * only the selected one meant walking past a resource showed nothing at all.
 */
export function HotspotMarkers({ hsSize, ctrlRef, viewMode }: HotspotMarkersProps) {
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);

  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const sinceSample = useRef(0);
  // The last set, as a joined key. State is written ONLY when the set actually
  // changes — a new array every sample would re-render the scene four times a
  // second for a list that is usually identical.
  const lastKey = useRef("");
  // What is on screen right now, so the next sample can favour keeping it.
  const shown = useRef<Set<string>>(new Set());

  useFrame((_, delta) => {
    sinceSample.current += delta * 1000;
    if (sinceSample.current < SAMPLE_MS) return;
    sinceSample.current = 0;

    // In the dollhouse the camera orbits the model while the player body stays
    // parked wherever it was left, so "near the player" describes nothing the
    // viewer can see. Only the selected marker shows from the air.
    if (viewMode !== "firstPerson") {
      if (lastKey.current !== "") {
        lastKey.current = "";
        shown.current = new Set();
        setNearbyIds([]);
      }
      return;
    }

    const controller = ctrlRef.current;
    if (!controller) return;
    const { x, z } = controller.getPosition();
    const { nearbyHotspotRadius: radius, nearbyHotspotMax: max } = scene.world;

    const showing = shown.current;
    const ids = hotspots
      .map((h) => {
        const d = Math.hypot(h.position[0] - x, h.position[2] - z);
        const visible = showing.has(h.id);
        // Already on screen: stays until it retreats past the wider band, and
        // holds its place at the cap against all but a clearly nearer rival.
        return { id: h.id, keep: d <= (visible ? radius * EXIT_SLACK : radius), rank: visible ? d * RANK_BIAS : d };
      })
      .filter((e) => e.keep)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, max)
      .map((e) => e.id);

    shown.current = new Set(ids);

    const key = ids.join(",");
    if (key === lastKey.current) return;
    lastKey.current = key;
    setNearbyIds(ids);
  });

  // Order matters, and so does de-duplication: the same resource can qualify
  // three ways at once and must still be exactly one disc.
  //
  //   1. the selection            — always, wherever the player is
  //   2. the current layout's own — always, even when they fall outside the
  //      radius. Several layouts frame their resources from further than 60
  //      units, and L10 overlooks the whole terminal from 180 up: measuring
  //      those by distance alone would arrive at a layout and show nothing
  //      belonging to it, which is the opposite of what travelling there is for
  //   3. whatever else is genuinely close, nearest first
  const own = currentLayoutId ? (LAYOUT_BY_ID[currentLayoutId]?.hotspots ?? []) : [];
  const ids = [...new Set([...(selectedHotspotId ? [selectedHotspotId] : []), ...own, ...nearbyIds])];

  return (
    <>
      {ids.map((id) => {
        const hotspot = HOTSPOT_BY_ID[id];
        const layout = hotspot ? LAYOUT_BY_ID[hotspot.layoutId] : null;
        if (!hotspot || !layout) return null;

        const isSelected = id === selectedHotspotId;
        return (
          <Hotspot
            key={id}
            position={hotspot.position}
            rotation={hotspot.rotation}
            title={`${hotspot.id} · ${hotspot.name}`}
            size={hsSize ?? 0.6}
            // Every marker is white — the pulse alone marks the selection, so
            // the discs stay one consistent thing rather than two kinds.
            pulse={isSelected}
            onHotspotClick={() =>
              setHotspotInfo({
                destId: layout.id,
                destLabel: layout.name,
                category: layout.zone,
                hotspotLabel: `${hotspot.id} · ${hotspot.name}`,
                index: layout.hotspots.indexOf(hotspot.id) + 1,
                total: layout.hotspots.length,
                position: hotspot.position,
              })
            }
          />
        );
      })}
    </>
  );
}
