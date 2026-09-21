"use client";

import { useCallback } from "react";
import { useSite } from "@/config/context";
import type { Destination, DestinationCategory } from "@/shared/types";
import { useScene } from "../context/scene-context";
import { GROUND_VIEW_BY_HOTSPOT } from "../ground-views";
import { useNavUiStore } from "../stores/nav-ui-store";

/** A layout as the engine holds it: the destination plus the zone it sits in. */
export interface LayoutEntry {
  destination: Destination;
  category: DestinationCategory;
}

export function useLayoutNavigation() {
  const site = useSite();
  const { playerControllerRef, triggerFloorTransition, activeFloor } = useScene();
  const currentDest = useNavUiStore((s) => s.currentDest);

  const entries = useCallback((): LayoutEntry[] => {
    const dests = activeFloor?.dests;
    if (!dests) return [];
    return (Object.keys(dests) as DestinationCategory[]).flatMap((category) =>
      (dests[category] ?? []).map((destination) => ({ destination, category })),
    );
  }, [activeFloor]);

  const find = useCallback(
    (layoutId: string) => entries().find((e) => e.destination.id === layoutId) ?? null,
    [entries],
  );

  const goToLayout = useCallback(
    (layoutId: string, onArrive?: () => void) => {
      const controller = playerControllerRef.current;
      const entry = find(layoutId);
      const camera = entry?.destination.camera;
      if (!controller || !entry || !camera) return;

      useNavUiStore.getState().setHotspotInfo(null);
      useNavUiStore.getState().setSelectedHotspotId(null);

      triggerFloorTransition(() => {
        const [x, authoredY, z] = camera.position;
        const cameraHeight = controller.getPosition().y - controller.getFootPosition().y;
        const footGuess = authoredY ? authoredY - cameraHeight : 0;
        const y =
          entry.destination.exactPose && authoredY
            ? authoredY - cameraHeight
            : controller.probeFloorY(x, z, footGuess) ?? footGuess;

        controller.teleportTo([x, y, z], camera.rotation);
        // Latch immediately rather than waiting for the position poll, so the
        // markers and the hotspot list update with the move, not after it.
        useNavUiStore.getState().setCurrentDest({
          id: entry.destination.id,
          label: entry.destination.label,
          category: entry.category,
          option: entry.destination.option,
        });

        // Runs INSIDE the swap, at full black — so a caller never has to guess
        // how long the blackout takes.
        onArrive?.();
      });
    },
    [playerControllerRef, triggerFloorTransition, find],
  );

  const goToHotspot = useCallback(
    (hotspotId: string, onArrive?: () => void) => {
      const controller = playerControllerRef.current;
      const hotspot = site.hotspotById[hotspotId] ?? site.securityHotspotById[hotspotId];
      const layout = hotspot ? site.layoutById[hotspot.layoutId] : null;
      if (!controller || !hotspot || !layout) return;

      const entry = find(layout.id);
      const pose = site.poseForHotspot(hotspotId);

      useNavUiStore.getState().setHotspotInfo(null);

      triggerFloorTransition(() => {
        const [x, authoredY, z] = pose.position;
        // Same seating rule as a layout: an aerial pose keeps its authored
        // height, a ground one snaps to the navmesh probed AT that height.
        const cameraHeight = controller.getPosition().y - controller.getFootPosition().y;
        const footGuess = authoredY ? authoredY - cameraHeight : 0;
        const y =
          layout.walkable === false && authoredY
            ? authoredY - cameraHeight
            : controller.probeFloorY(x, z, footGuess) ?? footGuess;

        controller.teleportTo([x, y, z], pose.rotation);

        if (entry) {
          useNavUiStore.getState().setCurrentDest({
            id: entry.destination.id,
            label: entry.destination.label,
            category: entry.category,
            option: entry.destination.option,
          });
        }
        // Inside the swap, at full black, so the bead is already placed and
        // its siblings already gone by the time the picture comes back.
        useNavUiStore.getState().setSelectedHotspotId(hotspotId);

        onArrive?.();
      });
    },
    [site, playerControllerRef, triggerFloorTransition, find],
  );

  const goToHotspotGround = useCallback(
    (hotspotId: string) => {
      const controller = playerControllerRef.current;
      const hotspot = site.hotspotById[hotspotId];
      const layout = hotspot ? site.layoutById[hotspot.layoutId] : null;
      const view = GROUND_VIEW_BY_HOTSPOT[hotspotId];
      if (!controller || !hotspot || !layout || !view) return;

      const entry = find(layout.id);

      useNavUiStore.getState().setHotspotInfo(null);

      triggerFloorTransition(() => {
        const [x, authoredSurfaceY, z] = view.position;
        const y = controller.probeFloorY(x, z, authoredSurfaceY) ?? authoredSurfaceY;

        controller.teleportTo([x, y, z], view.rotation);

        if (entry) {
          useNavUiStore.getState().setCurrentDest({
            id: entry.destination.id,
            label: entry.destination.label,
            category: entry.category,
            option: entry.destination.option,
          });
        }
        useNavUiStore.getState().setSelectedHotspotId(hotspotId);
      });
    },
    [site, playerControllerRef, triggerFloorTransition, find],
  );

  return {
    goToLayout,
    goToHotspot,
    goToHotspotGround,
    entries,
    find,
    currentLayoutId: currentDest?.id ?? null,
  };
}
