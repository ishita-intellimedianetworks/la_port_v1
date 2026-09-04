import type { CameraPose } from "@/config/schema";

/**
 * /v3 override for the bottom bar's "First Person" drop point. `overlays.tsx`
 * reads this first and falls back to `cameras.firstPerson` in `sites/v3.json`,
 * so deleting this file restores the config behaviour.
 *
 * Captured in the running app off the ?debug=true panel and verified against
 * the navmesh /v3 streams (v8w-inst-mo/navmesh.glb): the XZ lands inside a
 * triangle with walkable path ahead. Re-check if the route is pointed at
 * another bake — a pose that misses the navmesh strands the player.
 */
export const FIRST_PERSON_VIEW: CameraPose = {
  /** Foot position, not eye — Y is the navmesh surface (`world.eyeHeight` is
   *  added on top), so a missed floor probe still seats the player on ground. */
  position: [-897.9, 0.13, 150.8018],
  /** YXZ, the order `teleportTo` applies — not the XYZ the debug panel prints. */
  rotation: [0.0216, -0.4173, 0],
};
