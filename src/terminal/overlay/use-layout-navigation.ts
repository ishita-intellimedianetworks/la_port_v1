"use client";

import { useCallback } from "react";
import { HOTSPOT_BY_ID, LAYOUT_BY_ID, isFlyLayout } from "@/config";
import type { Destination, DestinationCategory } from "@/shared/types";
import { useScene } from "../context/scene-context";
import { useNavUiStore } from "../stores/nav-ui-store";

/** A layout as the engine holds it: the destination plus the zone it sits in. */
export interface LayoutEntry {
  destination: Destination;
  category: DestinationCategory;
}

/**
 * Travel between layouts.
 *
 * A layout IS a destination in the engine, and its zone is the category it is
 * filed under — so finding one means scanning the active floor's categories.
 *
 * Two ways to travel:
 *
 *   TELEPORT  a blackout swap. Always available. Ten layouts across a 205-acre
 *             terminal makes walking between them a very long trip.
 *   WALK      a navmesh route the player actually follows, with the turn HUD
 *             and the 3D route ribbon.
 *
 * Walking needs ground at BOTH ends. L01 and L10 are aerial cameras with no
 * navmesh beneath them, so any trip that starts or finishes at one is a
 * teleport — `canWalkTo` is what the UI asks before offering the choice.
 */
export function useLayoutNavigation() {
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

      triggerFloorTransition(() => {
        const [x, authoredY, z] = camera.position;
        // Elevated layouts keep their authored eye height (teleportTo re-adds
        // the camera height); ground ones snap to the navmesh probed AT that
        // height, so both land where the pose was authored.
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

  /**
   * Whether a WALK to this layout is possible from where the player stands.
   *
   * False if the destination camera flies, and false if the current one does:
   * there is no navmesh under an aerial camera to path to or from. The UI hides
   * the walk action rather than offering one that would fail.
   */
  const canWalkTo = useCallback(
    (layoutId: string) => {
      if (isFlyLayout(layoutId)) return false;
      if (isFlyLayout(currentDest?.id)) return false;
      // Already standing there — nothing to walk.
      return currentDest?.id !== layoutId;
    },
    [currentDest],
  );

  /**
   * Walk to a layout along the navmesh.
   *
   * The authored pose is re-applied on arrival: a walk ends facing the way you
   * were travelling, which is rarely the way the layout was framed to be seen,
   * and for a resource would leave its marker behind the player.
   */
  const walkToLayout = useCallback(
    (layoutId: string, onArrive?: () => void) => {
      const controller = playerControllerRef.current;
      const entry = find(layoutId);
      const camera = entry?.destination.camera;
      if (!controller || !entry || !camera || !canWalkTo(layoutId)) return false;

      const [x, , z] = camera.position;
      const floorY = controller.probeFloorY(x, z, 0) ?? 0;

      useNavUiStore.getState().setHotspotInfo(null);
      // A walk started from a panel is the one case that raises the turn HUD;
      // map clicks and double-clicks walk silently.
      useNavUiStore.getState().setNavHud(true);

      const started = controller.navigateToPoint({ x, y: floorY, z }, undefined, () => {
        // Settle into the authored framing, smoothly, from wherever the walk
        // left the player facing.
        controller.teleportTo([x, floorY, z], camera.rotation, true);
        useNavUiStore.getState().setCurrentDest({
          id: entry.destination.id,
          label: entry.destination.label,
          category: entry.category,
          option: entry.destination.option,
        });
        onArrive?.();
      });

      if (!started) useNavUiStore.getState().setNavHud(false);
      return started;
    },
    [playerControllerRef, find, canWalkTo],
  );

  /**
   * Select a resource and travel to the camera position it is viewed from.
   *
   * Selecting is what places its marker in the scene. The data card is NOT
   * opened here — arriving should leave the operator looking at the marker in
   * context; clicking that marker is what opens the data. Picking one in the
   * layout you already stand in skips the blackout, since teleporting to the
   * pose you already occupy reads as a glitch.
   */
  const goToHotspot = useCallback(
    (hotspotId: string) => {
      const hotspot = HOTSPOT_BY_ID[hotspotId];
      const layout = hotspot ? LAYOUT_BY_ID[hotspot.layoutId] : null;
      if (!hotspot || !layout) return;

      // Read the store fresh at call time rather than from a snapshot taken
      // before the writes below.
      const select = () => useNavUiStore.getState().setSelectedHotspotId(hotspotId);

      select();

      if (useNavUiStore.getState().currentDest?.id === layout.id) return;

      // goToLayout clears any open card as it starts; re-select inside its
      // swap, at full black, so the marker is already placed on arrival.
      goToLayout(layout.id, select);
    },
    [goToLayout],
  );

  /**
   * Walk to the camera position a resource is viewed from, placing its marker.
   *
   * Same contract as picking it from the list, minus the blackout — the marker
   * goes down first so it is already there when the walk arrives.
   */
  const walkToHotspot = useCallback(
    (hotspotId: string) => {
      const hotspot = HOTSPOT_BY_ID[hotspotId];
      const layout = hotspot ? LAYOUT_BY_ID[hotspot.layoutId] : null;
      if (!hotspot || !layout) return false;

      useNavUiStore.getState().setSelectedHotspotId(hotspotId);
      return walkToLayout(layout.id);
    },
    [walkToLayout],
  );

  /** Whether a resource can be walked to — decided by its layout's camera. */
  const canWalkToHotspot = useCallback(
    (hotspotId: string) => {
      const hotspot = HOTSPOT_BY_ID[hotspotId];
      return !!hotspot && canWalkTo(hotspot.layoutId);
    },
    [canWalkTo],
  );

  return {
    goToLayout,
    goToHotspot,
    walkToLayout,
    walkToHotspot,
    canWalkTo,
    canWalkToHotspot,
    entries,
    find,
    currentLayoutId: currentDest?.id ?? null,
  };
}
