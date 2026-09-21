"use client";

import { useSite } from "@/config/context";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { Hotspot } from "./hotspot";

interface HotspotMarkersProps {
  hsSize?: number;
}

export function HotspotMarkers({ hsSize }: HotspotMarkersProps) {
  const site = useSite();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);

  const own = currentLayoutId ? (site.layoutById[currentLayoutId]?.hotspots ?? []) : [];
  const picked = selectedHotspotId ? [selectedHotspotId] : own;

  const ids = openHotspotId ? picked.filter((id) => id !== openHotspotId) : picked;

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
