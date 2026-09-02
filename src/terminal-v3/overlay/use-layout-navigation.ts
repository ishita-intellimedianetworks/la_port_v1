"use client";

import { useCallback } from "react";
import { HOTSPOT_BY_ID, LAYOUT_BY_ID, poseForHotspot } from "@/config";
import type { Destination, DestinationCategory } from "@/shared/types";
import { useScene } from "../context/scene-context";
import { GROUND_VIEW_BY_HOTSPOT } from "../ground-views";
import { cameraForLayoutV3 } from "../layout-cameras";
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
 * Travel is always a TELEPORT — a blackout swap. Ten layouts across a 205-acre
 * terminal made walking between them a very long trip, and half the cameras are
 * aerial with no navmesh under them, so the walk was unavailable exactly where
 * the distances were worst. Walking still exists in the SCENE (double-click the
 * floor); it is just not how you cross the terminal.
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
      // /v3 streams a different bake, so a shot composed against the old one can
      // land inside geometry v8 added. `layout-cameras.ts` re-aims the few that
      // do; everything else falls straight through to `site.json`.
      const authored = entry?.destination.camera;
      const camera = authored ? cameraForLayoutV3(layoutId, authored) : undefined;
      if (!controller || !entry || !camera) return;

      // Travelling to a LAYOUT drops any resource selection: the request was
      // for the place, so arriving must show every bead filed there rather than
      // the one left over from a previous pick.
      useNavUiStore.getState().setHotspotInfo(null);
      useNavUiStore.getState().setSelectedHotspotId(null);

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
   * Travel to a resource's OWN camera and select it.
   *
   * A hotspot now frames itself rather than borrowing its layout's wide shot,
   * so this does NOT route through `goToLayout` — that would land on the group
   * pose and clear the very selection being made. The two differ on purpose:
   *
   *   layout   its camera frames the GROUP; arriving shows every bead in it.
   *   hotspot  its camera frames ITSELF; arriving shows that one bead.
   *
   * `currentDest` is still latched to the PARENT layout, because that is where
   * the player physically is — the tree, the map and the marker set all read it.
   * The data card is not opened here: arriving should leave the operator looking
   * at the bead in context, and clicking it is what opens the data.
   */
  const goToHotspot = useCallback(
    (hotspotId: string) => {
      const controller = playerControllerRef.current;
      const hotspot = HOTSPOT_BY_ID[hotspotId];
      const layout = hotspot ? LAYOUT_BY_ID[hotspot.layoutId] : null;
      if (!controller || !hotspot || !layout) return;

      const entry = find(layout.id);
      // A hotspot with no camera of its own inherits its layout's — so it has
      // to inherit the /v3 override too, or travelling to the Berth would land
      // inside the hull the layout row just avoided.
      const pose = hotspot.camera
        ? poseForHotspot(hotspotId)
        : cameraForLayoutV3(layout.id, poseForHotspot(hotspotId));

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
      });
    },
    [playerControllerRef, triggerFloorTransition, find],
  );

  /**
   * Travel to a resource's GROUND standpoint — the walk affordance in the
   * Resources tree.
   *
   * The difference from `goToHotspot` is only where you land, and it is the
   * whole point: that one keeps the layout's authored aerial height (every
   * layout is `walkable: false`), this one puts the player's FEET on the
   * navmesh and lets the controller supply the eye height. So the view arrives
   * at exactly the height walking there would have given — no authored Y is
   * trusted for the camera.
   *
   * The stored `position[1]` is the surface Y the pose was authored against,
   * used here only as `probeFloorY`'s tie-breaker (it disambiguates stacked
   * triangles) and as the fallback if the probe misses the mesh entirely. What
   * actually seats the player is the LIVE navmesh, so a re-bake that shifts the
   * ground moves the camera with it instead of leaving it hovering.
   *
   * Everything else matches `goToHotspot`: `currentDest` stays latched to the
   * parent layout because that is where the player physically is, the bead is
   * selected so the scene narrows to the one resource, and the data card is
   * left closed — arriving should leave you looking at the thing, and clicking
   * the bead is what opens the readings.
   */
  const goToHotspotGround = useCallback(
    (hotspotId: string) => {
      const controller = playerControllerRef.current;
      const hotspot = HOTSPOT_BY_ID[hotspotId];
      const layout = hotspot ? LAYOUT_BY_ID[hotspot.layoutId] : null;
      const view = GROUND_VIEW_BY_HOTSPOT[hotspotId];
      if (!controller || !hotspot || !layout || !view) return;

      const entry = find(layout.id);

      useNavUiStore.getState().setHotspotInfo(null);

      triggerFloorTransition(() => {
        const [x, authoredSurfaceY, z] = view.position;
        // Feet on the navmesh. `teleportTo` adds the controller's camera height
        // on top, which is `world.eyeHeight` — the same figure the walking view
        // uses, so this pose cannot drift from first-person height.
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
    [playerControllerRef, triggerFloorTransition, find],
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
