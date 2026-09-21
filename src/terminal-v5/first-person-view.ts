import type { CameraPose } from "@/config/schema";

export const FIRST_PERSON_VIEW: CameraPose = {
  /** Foot position, not eye — Y is the navmesh surface (`world.eyeHeight` is
   *  added on top), so a missed floor probe still seats the player on ground. */
  position: [-897.9, 0.13, 150.8018],
  /** YXZ, the order `teleportTo` applies — not the XYZ the debug panel prints. */
  rotation: [0.0216, -0.4173, 0],
};
