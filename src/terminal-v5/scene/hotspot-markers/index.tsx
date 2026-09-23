"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useSite } from "@/config/context";
import { useScene } from "../../context/scene-context";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { useSecurityStore } from "../../stores/security-store";
import { useDebugStore } from "../../stores/debug-store";
import { Hotspot } from "./hotspot";

const GROUND_EPS = 1.5;

const NEARBY_UNITS = 150;

const NEARBY_SAMPLE = 0.25;

const SECURITY_MINOR_BEAD = 0.55;

interface HotspotMarkersProps {
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
  const anchorDraft = useDebugStore((s) => s.anchorDraft);

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
        .filter((h) => h.enabled !== false && within(h.position))
        .map((h) => h.id),
    ];
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

  // A picked security anchor leaves the rest of the security row drawn, so a
  // picked operational one brings its own layout's siblings with it. Both
  // answer the same question: what else belongs to the thing being looked at.
  const pickedLayoutId =
    !ground.on && selectedHotspotId ? (site.hotspotById[selectedHotspotId]?.layoutId ?? null) : null;
  const picked = ground.on
    ? own
    : selectedHotspotId
      ? (pickedLayoutId
          ? (site.layoutById[pickedLayoutId]?.hotspots ?? [selectedHotspotId])
          : [selectedHotspotId])
      : own;

  // A layout's children move while the layout is what is being looked at. The
  // moment one of them is picked it becomes the subject on its own and the rest
  // settle, so this is gated on nothing being selected.
  const layoutMoves = !ground.on && !selectedHotspotId ? currentLayoutId : null;

  const alwaysOn = useMemo(
    () =>
      securityHotspots.filter((h) => h.enabled !== false).map((h) => h.id),
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
        const isSecurity = !site.hotspotById[id];
        const inMovingLayout =
          !isSecurity && !!layoutMoves && hotspot.layoutId === layoutMoves;
        return (
          <Hotspot
            key={id}
            position={anchorDraft?.id === id ? anchorDraft.position : hotspot.position}
            rotation={hotspot.rotation}
            title={hotspot.name}
            size={hsSize ?? 0.6}
            pulse={isSelected || inMovingLayout}
            beadScale={isSecurity && !isSelected ? SECURITY_MINOR_BEAD : 1}
            still={!isSelected && !inMovingLayout}
            screenLocked={isSecurity}
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
