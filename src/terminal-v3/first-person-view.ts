import type { CameraPose } from "@/config/schema";

/**
 * WHERE THE BOTTOM BAR'S "First Person" CIRCLE DROPS YOU — the /v3 answer.
 *
 * `site.json` already has `cameras.firstPerson`, and `/` and `/v2` still use
 * it. This file overrides it for /v3 ONLY, for the same reason `ground-views.ts`
 * exists: `site.json` is shared by all three routes, and a pose changed there
 * moves the circle under the other two as well. `overlays.tsx` reads this first
 * and falls back to the config pose, so deleting this file restores the shared
 * behaviour exactly.
 *
 * THE POSE WAS FLOWN, NOT COMPOSED. Captured standing in the running app and
 * copied off the ?debug=true panel, which prints the EYE position and an XYZ
 * euler. Neither is what gets stored here, so this is a conversion, not a
 * paste — see the two notes on the constant below.
 *
 * ON THE NAVMESH, which is the whole point of this button. Checked against the
 * navmesh that ships with the bake /v3 streams (v8w-inst-mo/navmesh.glb, 6,364
 * triangles, flat at Y 0.130): this XZ lands INSIDE a triangle, with 40 m of
 * walkable path ahead within +/-30 deg of the view and 120 m2 of ground in the
 * 30x30 m box around it. Re-run that check if the route is ever pointed at
 * another bake — the navmesh travels with the chunks, and a pose that misses
 * the mesh strands the player, which is the exact failure this button exists to
 * avoid.
 *
 * WHAT IT LOOKS AT. Yaw -23.9 deg sights down the long axis of the terminal:
 * H25, H23 and H24 all sit within 1.3 deg of centre at 490-530 m. It faces the
 * light — view direction dotted with the horizontal direction to
 * `lights.sunDirection` is +0.59 — so the far end of that view is backlit. That
 * is inherited from the flown pose, not chosen.
 *
 * THE POSE IT REPLACED, for /v3 only: [-1207.8126, 3.7531, -186.9518] with YXZ
 * [-0.0349, 2.6669, 0], from cp_011 in la-port-zone-c5-cp-v3.glb. It is still
 * walkable on v8 (inside a triangle, 40 m of path, 277 m2) and still lives in
 * `site.json` — that block is unchanged and is what `/` and `/v2` use.
 */
export const FIRST_PERSON_VIEW: CameraPose = {
  /**
   * A FOOT position, unlike `cameras.firstPerson`, which stores the camera's
   * authored height. Y here is the navmesh surface: the debug panel's eye
   * position was [-897.9, 1.9588, 150.8018] and `world.eyeHeight` is 1.8288,
   * which leaves exactly the 0.130 this mesh sits at. Either number works as
   * `probeFloorY`'s `expectedY` on a mesh this flat, but the surface value is
   * the safer FALLBACK if the probe ever misses — it seats the player on the
   * ground rather than 1.8 m above it.
   */
  position: [-897.9, 0.13, 150.8018],
  /**
   * YXZ, the order `teleportTo` applies — NOT the XYZ the debug panel prints.
   * The reorder of its [0.0236, -0.4172, 0.0096] through the quaternion; the
   * 0.002 deg of roll it carried rounds away.
   */
  rotation: [0.0216, -0.4173, 0],
};
