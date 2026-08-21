"use client";

import { useState } from "react";
import { HOTSPOT_BY_ID, LAYOUT_BY_ID, hotspots, ui as uiCopy } from "@/config";
import { useScene } from "../../context/scene-context";
import { EdgeFlap } from "../edge-flap";
import { DestinationDetail } from "../destination-detail";
import { useTravelEstimate } from "../destination-detail/use-travel-estimate";
import { TravelRow } from "../travel-row";
import { useLayoutNavigation } from "../use-layout-navigation";
import { useNavUiStore } from "../../stores/nav-ui-store";

interface HotspotsFlapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Tuck the flap off-edge (walking, or an overlay owns the view). */
  tucked?: boolean;
}

/**
 * The LEFT edge flap: all thirty resources as one flat list.
 *
 * Two levels: the list, and the destination view for whichever row was tapped
 * — the handoff's Expected Interaction for that resource, plus how far and how
 * long it is to walk there. Travelling places its marker and closes the flap;
 * the data card opens from the marker, not from here.
 */
export function HotspotsFlap({ open, onOpenChange, disabled, tucked }: HotspotsFlapProps) {
  const { playerControllerRef } = useScene();
  const { goToHotspot, walkToHotspot, canWalkToHotspot, currentLayoutId } = useLayoutNavigation();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const [openId, setOpenId] = useState<string | null>(null);

  const detail = openId ? HOTSPOT_BY_ID[openId] : null;
  const parent = detail ? LAYOUT_BY_ID[detail.layoutId] : null;
  const estimate = useTravelEstimate(playerControllerRef, parent?.id ?? null, !!detail && open);

  const close = () => {
    setOpenId(null);
    onOpenChange(false);
  };

  return (
    <EdgeFlap
      side="left"
      label={uiCopy.panels.hotspotsFlapLabel}
      title={detail ? detail.name : uiCopy.panels.hotspotsTitle}
      subtitle={detail ? detail.id : uiCopy.panels.hotspotsSubtitle}
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpenId(null);
        onOpenChange(next);
      }}
      onBack={detail ? () => setOpenId(null) : undefined}
      disabled={disabled}
      tucked={tucked}
    >
      {detail && parent ? (
        <DestinationDetail
          code={detail.id}
          context={`${parent.id} ${parent.name}`}
          overview={detail.interaction}
          reached={parent.id === currentLayoutId}
          walkable={canWalkToHotspot(detail.id)}
          estimate={estimate}
          onWalk={() => {
            walkToHotspot(detail.id);
            close();
          }}
          onTeleport={() => {
            goToHotspot(detail.id);
            close();
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {hotspots.map((hotspot) => (
            <TravelRow
              key={hotspot.id}
              code={hotspot.id}
              name={hotspot.name}
              active={hotspot.id === selectedHotspotId}
              onSelect={() => setOpenId(hotspot.id)}
            />
          ))}
        </div>
      )}
    </EdgeFlap>
  );
}
