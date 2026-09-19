export interface MinimapSticker {
  /** World X of the point the sticker labels (matches the white dot in the PNG). */
  x: number;
  /** World Z of the labelled point. */
  z: number;
  /** Free-text label, e.g. "Way to Floor 2". */
  label: string;
  /**
   * Sticker direction from the anchor, in degrees clockwise from "up":
   *   0   → sticker straight up      (north)
   *   90  → sticker to the right     (east)
   *   180 → sticker straight down    (south)
   *   270 → sticker to the left      (west)
   * If omitted, the renderer auto-picks the nearest canvas edge.
   */
  angle?: number;
  /**
   * Leader-line length, in canvas pixels (anchor → sticker centre).
   * If omitted, the renderer uses the default edge-aligned placement.
   */
  length?: number;
  /**
   * Optional yaw target. When a minimap click lands near this sticker, the
   * player walks to (x, z) and then rotates (yaw only) to face this XZ point —
   * used to make "Way to Floor N" stickers look toward the staircase on arrival.
   */
  lookAt?: { x: number; z: number };
}

export interface MinimapData {
  imageUrl: string;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  stickers?: MinimapSticker[];
}
