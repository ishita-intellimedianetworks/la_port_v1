import type * as THREE from "three";
import type { Pathfinding } from "three-pathfinding";

/**
 * Probes the navmesh of `zone` for the surface Y under (x, z).
 *
 * - Walks every triangle, runs the standard 2D barycentric containment check on
 *   the XZ projection, and when the point is inside returns the Y interpolated
 *   from the three vertex Ys via the same barycentric weights — i.e. the exact
 *   surface Y, not a centroid average.
 * - When `expectedY` is provided and several triangles contain the point (e.g.
 *   stacked floors in a merged-zone navmesh), the candidate whose Y is closest
 *   to `expectedY` wins.
 *
 * Returns null when the (x, z) lies outside the navmesh.
 */
export function probeFloorY(
  pathfinding: Pathfinding,
  zone: string,
  x: number,
  z: number,
  expectedY?: number,
): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoneData = (pathfinding as any).zones?.[zone];
  if (!zoneData) return null;

  const vertices: THREE.Vector3[] = zoneData.vertices ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[][] = zoneData.groups ?? [];

  let best: number | null = null;
  let bestDiff = Infinity;
  const tol = 1e-3;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    for (let i = 0; i < group.length; i++) {
      const node = group[i];
      const ids: number[] = node.vertexIds;
      if (!ids || ids.length < 3) continue;
      const v0 = vertices[ids[0]];
      const v1 = vertices[ids[1]];
      const v2 = vertices[ids[2]];
      if (!v0 || !v1 || !v2) continue;

      const denom = (v1.z - v2.z) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.z - v2.z);
      if (Math.abs(denom) < 1e-9) continue;

      const a = ((v1.z - v2.z) * (x - v2.x) + (v2.x - v1.x) * (z - v2.z)) / denom;
      const b = ((v2.z - v0.z) * (x - v2.x) + (v0.x - v2.x) * (z - v2.z)) / denom;
      const c = 1 - a - b;
      if (a < -tol || b < -tol || c < -tol) continue;

      const ty = a * v0.y + b * v1.y + c * v2.y;
      if (expectedY === undefined) {
        return ty;
      }
      const diff = Math.abs(ty - expectedY);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = ty;
      }
    }
  }
  return best;
}

/**
 * Nearest point ON the zone's navmesh to an arbitrary world point — a full
 * closest-point-on-triangle sweep (Ericson), not just the nearest vertex.
 * Used to SNAP off-mesh clicks onto the walkable surface (memorial: the mesh
 * covers only the authored corridors, so most of the visible ground is
 * off-mesh and a strict on-mesh check rejects nearly every click).
 *
 * Returns null when the zone has no triangles.
 */
export function closestNavmeshPoint(
  pathfinding: Pathfinding,
  zone: string,
  px: number,
  py: number,
  pz: number,
  /** Optional height band — only surface points with yMin ≤ y ≤ yMax are
   *  considered (used to clamp a click on another level to the nearest
   *  walkable point on the PLAYER'S level). */
  yMin = -Infinity,
  yMax = Infinity,
  /** Optional pathfinding group (navmesh island). When provided, only that
   *  group's triangles are swept — so the returned point is guaranteed
   *  REACHABLE from anywhere on the same island. Without it the sweep can
   *  return a point on a disconnected island that no route can reach. */
  onlyGroup?: number,
): { x: number; y: number; z: number; dist: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoneData = (pathfinding as any).zones?.[zone];
  if (!zoneData) return null;
  const vertices: THREE.Vector3[] = zoneData.vertices ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any[][] = zoneData.groups ?? [];

  let best: { x: number; y: number; z: number; dist: number } | null = null;

  for (let g = 0; g < groups.length; g++) {
    if (onlyGroup !== undefined && g !== onlyGroup) continue;
    const group = groups[g];
    for (let i = 0; i < group.length; i++) {
      const ids: number[] = group[i].vertexIds;
      if (!ids || ids.length < 3) continue;
      const a = vertices[ids[0]];
      const b = vertices[ids[1]];
      const c = vertices[ids[2]];
      if (!a || !b || !c) continue;

      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
      const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
      const d1 = abx * apx + aby * apy + abz * apz;
      const d2 = acx * apx + acy * apy + acz * apz;
      let qx: number, qy: number, qz: number;
      if (d1 <= 0 && d2 <= 0) {
        qx = a.x; qy = a.y; qz = a.z;
      } else {
        const bpx = px - b.x, bpy = py - b.y, bpz = pz - b.z;
        const d3 = abx * bpx + aby * bpy + abz * bpz;
        const d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) {
          qx = b.x; qy = b.y; qz = b.z;
        } else {
          const vc = d1 * d4 - d3 * d2;
          if (vc <= 0 && d1 >= 0 && d3 <= 0) {
            const v = d1 / (d1 - d3);
            qx = a.x + abx * v; qy = a.y + aby * v; qz = a.z + abz * v;
          } else {
            const cpx = px - c.x, cpy = py - c.y, cpz = pz - c.z;
            const d5 = abx * cpx + aby * cpy + abz * cpz;
            const d6 = acx * cpx + acy * cpy + acz * cpz;
            if (d6 >= 0 && d5 <= d6) {
              qx = c.x; qy = c.y; qz = c.z;
            } else {
              const vb = d5 * d2 - d1 * d6;
              if (vb <= 0 && d2 >= 0 && d6 <= 0) {
                const w = d2 / (d2 - d6);
                qx = a.x + acx * w; qy = a.y + acy * w; qz = a.z + acz * w;
              } else {
                const va = d3 * d6 - d5 * d4;
                if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                  const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                  qx = b.x + (c.x - b.x) * w; qy = b.y + (c.y - b.y) * w; qz = b.z + (c.z - b.z) * w;
                } else {
                  const denom = 1 / (va + vb + vc);
                  const v = vb * denom;
                  const w = vc * denom;
                  qx = a.x + abx * v + acx * w;
                  qy = a.y + aby * v + acy * w;
                  qz = a.z + abz * v + acz * w;
                }
              }
            }
          }
        }
      }

      if (qy < yMin || qy > yMax) continue;
      const dist = Math.hypot(qx - px, qy - py, qz - pz);
      if (!best || dist < best.dist) best = { x: qx, y: qy, z: qz, dist };
    }
  }
  return best;
}
