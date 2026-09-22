export interface MinimapSticker {
  x: number;
  z: number;
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
