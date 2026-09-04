"use client";

import { useSite } from "@/config/context";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { Hotspot } from "./hotspot";

interface HotspotMarkersProps {
  /** Base marker radius in world units (FloorConfig.hsSize). Markers draw at a
   *  constant screen size; this is what that scaling starts from and clamps to. */
  hsSize?: number;
}

/**
 * The resource markers in the scene. What is drawn follows entirely from what
 * was picked in the Resources panel — never from proximity to the player.
 */
export function HotspotMarkers({ hsSize }: HotspotMarkersProps) {
  const site = useSite();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);
  const atGroundView = useNavUiStore((s) => s.atGroundView);

  // Either/or, never both: a picked resource shows that disc alone, otherwise
  // every resource filed under the current layout regardless of distance.
  const own = currentLayoutId ? (site.layoutById[currentLayoutId]?.hotspots ?? []) : [];
  const picked = selectedHotspotId ? [selectedHotspotId] : own;

  // A marker whose card is open takes itself down — it would otherwise pulse
  // behind, or under, the panel it just opened. Restored on `setHotspotInfo(null)`.
  const ids = openHotspotId ? picked.filter((id) => id !== openHotspotId) : picked;

  // At the ground standpoint: no markers at all. See `atGroundView` in the nav store.
  if (atGroundView) return null;

  return (
    <>
      {ids.map((id) => {
        const hotspot = site.hotspotById[id];
        const layout = hotspot ? site.layoutById[hotspot.layoutId] : null;
        if (!hotspot || !layout) return null;

        const isSelected = id === selectedHotspotId;
        return (
          <Hotspot
            key={id}
            position={hotspot.position}
            rotation={hotspot.rotation}
            title={hotspot.name}
            size={hsSize ?? 0.6}
            // Markers are all white; the pulse alone marks the selection.
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
