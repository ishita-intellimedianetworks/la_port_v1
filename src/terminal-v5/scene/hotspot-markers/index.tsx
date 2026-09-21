"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useSite } from "@/config/context";
import { useScene } from "../../context/scene-context";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { isFieldHotspot, useSecurityStore } from "../../stores/security-store";
import { Hotspot } from "./hotspot";

const GROUND_EPS = 1.5;

const NEARBY_UNITS = 150;

const NEARBY_SAMPLE = 0.25;

interface HotspotMarkersProps {
  /** Base marker radius in world units (FloorConfig.hsSize). Markers draw at a
   *  constant screen size; this is what that scaling starts from and clamps to. */
  hsSize?: number;
}

export function HotspotMarkers({ hsSize }: HotspotMarkersProps) {
  const site = useSite();
  const { playerControllerRef } = useScene();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);
  const securityHotspots = useSecurityStore((s) => s.hotspots);
  const securityHotspotById = useSecurityStore((s) => s.hotspotById);

  const [ground, setGround] = useState<{ on: boolean; ids: string[] }>({ on: false, ids: [] });
  const sinceSample = useRef(0);
  useFrame((_, dt) => {
    sinceSample.current += dt;
    if (sinceSample.current < NEARBY_SAMPLE) return;
    sinceSample.current = 0;

    const controller = playerControllerRef.current;
    const foot = controller?.getFootPosition();
    const floor = foot ? controller?.probeFloorY(foot.x, foot.z, foot.y) : null;
    const grounded = !!foot && floor != null && Math.abs(foot.y - floor) < GROUND_EPS;
    if (!grounded) {
      setGround((prev) => (prev.on ? { on: false, ids: [] } : prev));
      return;
    }

    const within = (pos: readonly number[]) =>
      Math.hypot(foot.x - pos[0], foot.z - pos[2]) < NEARBY_UNITS;
    const ids = [
      ...site.hotspots.filter((h) => within(h.position)).map((h) => h.id),
      ...securityHotspots
        .filter((h) => h.enabled !== false && isFieldHotspot(h.id) && within(h.position))
        .map((h) => h.id),
    ];
    // Only on a CHANGE of set: this runs four times a second and a new object
    // every time would re-render the whole marker tree for nothing.
    setGround((prev) =>
      prev.on && prev.ids.length === ids.length && prev.ids.every((id, i) => id === ids[i])
        ? prev
        : { on: true, ids },
    );
  });

  const own = ground.on
    ? ground.ids
    : currentLayoutId
      ? (site.layoutById[currentLayoutId]?.hotspots ?? [])
      : [];
  // A picked resource shows that disc alone — but not on the ground, where the
  // pick came with a standpoint and the point is to look around from it.
  const picked = selectedHotspotId && !ground.on ? [selectedHotspotId] : own;

  const alwaysOn = useMemo(
    () =>
      securityHotspots
        .filter((h) => h.enabled !== false && isFieldHotspot(h.id))
        .map((h) => h.id),
    [securityHotspots],
  );

  const all = new Set([...picked, ...alwaysOn]);
  if (openHotspotId) all.delete(openHotspotId);
  const ids = [...all];

  return (
    <>
      {ids.map((id) => {
        const hotspot = site.hotspotById[id] ?? securityHotspotById[id];
        const layout = hotspot ? site.layoutById[hotspot.layoutId] : null;
        if (!hotspot || !layout) return null;

        const siblings = site.hotspotById[id]
          ? layout.hotspots
          : securityHotspots.map((h) => h.id);

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
                index: siblings.indexOf(hotspot.id) + 1,
                total: siblings.length,
                position: hotspot.position,
              })
            }
          />
        );
      })}
    </>
  );
}
