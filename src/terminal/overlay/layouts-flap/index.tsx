"use client";

import { useState } from "react";
import { LAYOUT_BY_ID, layouts, ui as uiCopy } from "@/config";
import { useScene } from "../../context/scene-context";
import { EdgeFlap } from "../edge-flap";
import { DestinationDetail } from "../destination-detail";
import { useTravelEstimate } from "../destination-detail/use-travel-estimate";
import { TravelRow } from "../travel-row";
import { useLayoutNavigation } from "../use-layout-navigation";

interface LayoutsFlapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  /** Tuck the flap off-edge (walking, or an overlay owns the view). */
  tucked?: boolean;
}

/**
 * The RIGHT edge flap: L01-L10 as one flat list.
 *
 * Two levels: the list, and the destination view for whichever row was tapped.
 * The back arrow in the header returns to the list; travelling closes the flap.
 */
export function LayoutsFlap({ open, onOpenChange, disabled, tucked }: LayoutsFlapProps) {
  const { playerControllerRef } = useScene();
  const { goToLayout, walkToLayout, canWalkTo, currentLayoutId } = useLayoutNavigation();
  const [openId, setOpenId] = useState<string | null>(null);

  const detail = openId ? LAYOUT_BY_ID[openId] : null;
  const estimate = useTravelEstimate(playerControllerRef, openId, !!detail && open);

  const close = () => {
    setOpenId(null);
    onOpenChange(false);
  };

  return (
    <EdgeFlap
      side="right"
      label={uiCopy.panels.layoutsFlapLabel}
      title={detail ? detail.name : uiCopy.panels.layoutsTitle}
      subtitle={detail ? detail.id : uiCopy.panels.layoutsSubtitle}
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpenId(null);
        onOpenChange(next);
      }}
      onBack={detail ? () => setOpenId(null) : undefined}
      disabled={disabled}
      tucked={tucked}
    >
      {detail ? (
        <DestinationDetail
          code={detail.id}
          context={uiCopy.zones[detail.zone].label}
          overview={detail.purpose}
          reached={detail.id === currentLayoutId}
          walkable={canWalkTo(detail.id)}
          estimate={estimate}
          onWalk={() => {
            walkToLayout(detail.id);
            close();
          }}
          onTeleport={() => {
            goToLayout(detail.id);
            close();
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {layouts.map((layout) => (
            <TravelRow
              key={layout.id}
              code={layout.id}
              name={layout.name}
              active={layout.id === currentLayoutId}
              onSelect={() => setOpenId(layout.id)}
            />
          ))}
        </div>
      )}
    </EdgeFlap>
  );
}
