"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useSite } from "@/config/context";
import { useScene } from "../../context/scene-context";
import { useNavUiStore } from "../../stores/nav-ui-store";
import { isFieldHotspot, useSecurityStore } from "../../stores/security-store";
import { Hotspot } from "./hotspot";

/** How far the player's feet may be above the navmesh and still count as
 *  STANDING ON IT, in world units. The mesh is flat at Y 0.130 here, so this is
 *  slack for slopes and the settle after a teleport rather than a real range —
 *  an aerial camera is 20 to 180 units up and misses it by two orders of
 *  magnitude. */
const GROUND_EPS = 1.5;

/** How far a resource can be from the player and still count as NEARBY, in
 *  world units. Roughly metres: the gate's three hotspots sit 15-25 apart and a
 *  yard's about 50, so 150 puts a handful in reach without turning the walk into
 *  a field of beads. */
const NEARBY_UNITS = 150;

/** How often the nearby set is recomputed, in seconds. Distance to 38 anchors is
 *  nothing, but re-rendering on it every frame would be, so it is sampled and
 *  the state is written only when the SET changes. */
const NEARBY_SAMPLE = 0.25;

interface HotspotMarkersProps {
  /** Base marker radius in world units (FloorConfig.hsSize). Markers draw at a
   *  constant screen size; this is what that scaling starts from and clamps to. */
  hsSize?: number;
}

/**
 * The resource markers in the scene.
 *
 * Four states, in the order they are decided:
 *
 *   on the navmesh      whatever is within reach, security included — however
 *                       the operator got down there
 *   a resource picked   that one disc, pulsing
 *   otherwise           the layout being stood at, and nothing if there is none
 *
 * The dollhouse never reaches here: this component is mounted only in first
 * person (see `scene/index.tsx`), because from the air the beads are specks
 * floating over the model.
 */
export function HotspotMarkers({ hsSize }: HotspotMarkersProps) {
  const site = useSite();
  const { playerControllerRef } = useScene();
  const selectedHotspotId = useNavUiStore((s) => s.selectedHotspotId);
  const setHotspotInfo = useNavUiStore((s) => s.setHotspotInfo);
  const currentLayoutId = useNavUiStore((s) => s.currentDest?.id ?? null);
  const openHotspotId = useNavUiStore((s) => s.hotspotInfo?.hotspotId ?? null);
  const securityHotspots = useSecurityStore((s) => s.hotspots);
  const securityHotspotById = useSecurityStore((s) => s.hotspotById);

  // WALKING THE GROUND: what is within reach, from BOTH tables.
  //
  // Empty unless the player is standing on the navmesh, so it never fires from
  // an aerial camera - see the check inside.
  //
  // Security anchors are in it. Walking past the gate reader should show the
  // gate reader, and a layer that is invisible unless it was asked for by name
  // is a layer the operator has to already know about.
  const [ground, setGround] = useState<{ on: boolean; ids: string[] }>({ on: false, ids: [] });
  const sinceSample = useRef(0);
  useFrame((_, dt) => {
    sinceSample.current += dt;
    if (sinceSample.current < NEARBY_SAMPLE) return;
    sinceSample.current = 0;

    // ON THE NAVMESH, or nothing. "First person" is not the same question: every
    // layout camera is `walkable: false` and sits 20 to 180 units up, and the
    // view from one is still first person. What this set is for is the operator
    // WALKING — feet on the mesh, free to move — where the list's answer ("the
    // layout I arrived at") has stopped describing what is around them.
    //
    // Asked of the navmesh itself rather than of a flag: `probeFloorY` returns
    // the surface under the player, or null off the mesh entirely. A pose is
    // aerial or not by where it IS, which is the same rule `isFlyLayout` reads
    // off `walkable` in config.
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
      // Field anchors only. S07 and S08 are instruments, not places on the
      // terminal — walking near L10 should not put the incident log on a stick
      // in the yard.
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

  // ON THE MESH WINS. However the operator got down there — a resource's ground
  // standpoint, the First Person button, a walk from the map — they are free to
  // move, so what is AROUND them is the only useful answer and the list's one
  // ("the layout I arrived at") has stopped applying. Every branch below this
  // describes an aerial camera, where proximity means nothing.
  const own = ground.on
    ? ground.ids
    : currentLayoutId
      ? (site.layoutById[currentLayoutId]?.hotspots ?? [])
      : [];
  // A picked resource shows that disc alone — but not on the ground, where the
  // pick came with a standpoint and the point is to look around from it.
  const picked = selectedHotspotId && !ground.on ? [selectedHotspotId] : own;

  // A marker whose card is open takes itself down — it would otherwise pulse
  // behind, or under, the panel it just opened. Restored on `setHotspotInfo(null)`.
  const ids = openHotspotId ? picked.filter((id) => id !== openHotspotId) : picked;

  return (
    <>
      {ids.map((id) => {
        // Either table. A security anchor reaches this branch by being PICKED
        // in the Resources tree, which narrows `picked` to that one id — §8's
        // "unless a user explicitly selects" read straight: the layer stays
        // down with the shield off, except for the one anchor the operator
        // asked for by name. Nothing else here can produce a security id, so
        // the two layers still never draw together.
        const hotspot = site.hotspotById[id] ?? securityHotspotById[id];
        const layout = hotspot ? site.layoutById[hotspot.layoutId] : null;
        if (!hotspot || !layout) return null;

        // A security row is not a child of `layouts[].hotspots`, so it is
        // counted within the set the Resources tree shows it in — all eight
        // under the "Security" row, not the parent layout's operational
        // children. "2 of 8" then describes the list it was picked from, which
        // is the only count an operator can check.
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
