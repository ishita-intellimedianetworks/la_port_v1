import type { MinimapData } from "../types";

export function worldToPixel(
  wx: number,
  wz: number,
  bounds: MinimapData["bounds"],
  mapWidth: number,
  mapHeight: number,
): { px: number; py: number } {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxZ - bounds.minZ;
  return {
    px: bw === 0 ? 0 : ((wx - bounds.minX) / bw) * mapWidth,
    py: bh === 0 ? 0 : ((wz - bounds.minZ) / bh) * mapHeight,
  };
}

export function pixelToWorld(
  px: number,
  py: number,
  bounds: MinimapData["bounds"],
  mapWidth: number,
  mapHeight: number,
): { x: number; z: number } {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxZ - bounds.minZ;
  return {
    x: mapWidth  === 0 ? bounds.minX : (px / mapWidth)  * bw + bounds.minX,
    z: mapHeight === 0 ? bounds.minZ : (py / mapHeight) * bh + bounds.minZ,
  };
}
