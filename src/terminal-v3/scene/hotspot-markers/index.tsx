"use client";

import { HOTSPOT_BY_ID, LAYOUT_BY_ID } from "@/config";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { Hotspot } from "./hotspot";

interface HotspotMarkersProps {
  /** Base marker radius in world units (FloorConfig.hsSize). The marker is
   *  drawn at a constant size on SCREEN — this is the radius that rule scales
   *  from, and the bound it is clamped against. */
  hsSize?: number;
}

/**
 * The resource markers in the scene.
 *
 * What is drawn follows entirely from what was picked in the Resources panel —
 * one selected resource, or the resources belonging to the layout the player
 * stands at. See the note over `ids` below.
 *
 * There is deliberately NO proximity rule. An earlier version also surfaced
 * whatever fell within a radius of the player, re-ranked four times a second
 * with hysteresis to stop the set flickering. It meant arriving at one layout
 * showed a neighbour's discs, and what a viewer saw depended on where they
 * happened to be standing rather than on what they had asked for.
 */
export function HotspotMarkers({ hsSize }: HotspotMarkersProps) {
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);

  // EITHER / OR, never both — the marker set answers "what did you ask for?"
  //   a resource was picked   exactly that one disc, nothing else. Narrowing to
  //                           a single resource is the whole point of picking
  //                           it; leaving its siblings up made the selection
  //                           invisible among them.
  //   a layout was picked     every resource filed under it, regardless of
  //                           distance. Several layouts frame their resources
  //                           from further than 60 units and L10 overlooks the
  //                           terminal from 180 up, so ranking by distance
  //                           would arrive somewhere and show nothing that
  //                           belongs to it — the opposite of travelling there.
  // Distance plays no part any more: proximity used to add whatever happened to
  // be close, which meant arriving at one layout surfaced a neighbour's discs.
  const own = currentLayoutId ? (LAYOUT_BY_ID[currentLayoutId]?.hotspots ?? []) : [];
  const picked = selectedHotspotId ? [selectedHotspotId] : own;

  // A marker whose card is OPEN takes itself down. The card is the thing being
  // read at that moment, and the disc is only ever the way in to it — leaving
  // it lit behind the card meant a pulsing bead competing with the panel it had
  // just opened, and on a close-framed marker it sat under the card's own
  // glass. It comes straight back when the card closes (`setHotspotInfo(null)`).
  const ids = openHotspotId ? picked.filter((id) => id !== openHotspotId) : picked;

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
            title={hotspot.name}
            size={hsSize ?? 0.6}
            // Every marker is white — the pulse alone marks the selection, so
            // the discs stay one consistent thing rather than two kinds.
            pulse={isSelected}
            onHotspotClick={() =>
              setHotspotInfo({
                destId: layout.id,
                hotspotId: hotspot.id,
                destLabel: layout.name,
                category: layout.zone,
                hotspotLabel: hotspot.name,
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
