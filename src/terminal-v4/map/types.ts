export interface MinimapSticker {
  /** World X of the point the sticker labels (matches the white dot in the PNG). */
  x: number;
  /** World Z of the labelled point. */
  z: number;
  /** Free-text label, e.g. "Way to Floor 2". */
  label: string;
  angle?: number;
  length?: number;
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
