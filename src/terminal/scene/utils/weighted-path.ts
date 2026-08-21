/**
 * findPathWeighted — drop-in replacement for `Pathfinding.findPath` with a
 * correct, DISTANCE-based A* over the zone's polygon graph.
 *
 * Why not the library's findPath? three-pathfinding's A* has two defects that
 * make routes both suboptimal and DIRECTION-DEPENDENT (A→B takes a different
 * corridor than B→A):
 *   1. every polygon hop costs `1.0` regardless of size — the search minimises
 *      polygon COUNT, not metres, so meshes with irregular triangle sizes get
 *      bizarre detours;
 *   2. the heuristic is distance SQUARED (inadmissible — on a 400m route it's
 *      ~160,000 vs hop costs in the tens), which degenerates A* into greedy
 *      "run straight at the target". Greedy search commits to whichever
 *      corridor looks locally best from ITS starting end — hence the asymmetry
 *      (SoFi: Entrance 2 → 3 was 478m one way, 669m the other, on opposite
 *      sides of the stadium).
 *
 * This version scores g = accumulated centroid-to-centroid metres and
 * h = straight-line metres to the goal (admissible) → shortest corridor,
 * same route in both directions. The funnel (string pull) is a faithful
 * port of the library's Channel, fed the SAME portal data, so the output
 * has identical shape/format to findPath: world-space points, start point
 * omitted. Endpoint semantics also match — the start must lie inside a
 * polygon (checkPolygon), so existing centroid-fallback call sites work
 * unchanged.
 */
import * as THREE from "three";
import { Pathfinding } from "three-pathfinding";

interface ZoneNode {
  id: number;
  neighbours: number[];
  vertexIds: number[];
  centroid: THREE.Vector3;
  portals: number[][];
}

interface ZoneData {
  groups: ZoneNode[][];
  vertices: THREE.Vector3[];
}

interface Pt { x: number; y: number; z: number }

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Min-heap on f-score (the library's BinaryHeap isn't exported) ─────────
interface HeapEntry { n: ZoneNode; f: number }

class MinHeap {
  private a: HeapEntry[] = [];
  get size(): number { return this.a.length; }
  push(n: ZoneNode, f: number): void {
    const a = this.a;
    a.push({ n, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  }
  pop(): ZoneNode {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t;
        i = m;
      }
    }
    return top.n;
  }
}

// ── A* with metric costs. Returns the polygon corridor start→end inclusive. ──
function searchCorridor(nodes: ZoneNode[], start: ZoneNode, end: ZoneNode): ZoneNode[] {
  const g = new Map<number, number>();
  const parent = new Map<number, ZoneNode>();
  const closed = new Set<number>();
  const heap = new MinHeap();

  g.set(start.id, 0);
  heap.push(start, dist(start.centroid, end.centroid));

  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === end) {
      const out: ZoneNode[] = [];
      for (let n: ZoneNode | undefined = end; n; n = parent.get(n.id)) out.push(n);
      return out.reverse();
    }
    // Lazy-deletion heap: a node re-pushed with a better f leaves its stale
    // entry behind — skip it when it surfaces.
    if (closed.has(cur.id)) continue;
    closed.add(cur.id);

    const gCur = g.get(cur.id)!;
    for (const ni of cur.neighbours) {
      const nb = nodes[ni];
      if (closed.has(nb.id)) continue;
      const tentative = gCur + dist(cur.centroid, nb.centroid);
      const known = g.get(nb.id);
      if (known === undefined || tentative < known) {
        g.set(nb.id, tentative);
        parent.set(nb.id, cur);
        heap.push(nb, tentative + dist(nb.centroid, end.centroid));
      }
    }
  }
  return [];
}

// ── Funnel / string pull — port of three-pathfinding's Channel.stringPull ──
function triarea2(a: Pt, b: Pt, c: Pt): number {
  return (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z);
}

function vequal(a: Pt, b: Pt): boolean {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz < 0.00001;
}

interface Portal { left: Pt; right: Pt }

function stringPull(portals: Portal[]): Pt[] {
  const pts: Pt[] = [];
  let apex = portals[0].left;
  let left = portals[0].left;
  let right = portals[0].right;
  let apexIndex = 0, leftIndex = 0, rightIndex = 0;

  pts.push(apex);

  for (let i = 1; i < portals.length; i++) {
    const pl = portals[i].left;
    const pr = portals[i].right;

    if (triarea2(apex, right, pr) <= 0.0) {
      if (vequal(apex, right) || triarea2(apex, left, pr) > 0.0) {
        right = pr;
        rightIndex = i;
      } else {
        pts.push(left);
        apex = left;
        apexIndex = leftIndex;
        left = apex; right = apex;
        leftIndex = apexIndex; rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }

    if (triarea2(apex, left, pl) >= 0.0) {
      if (vequal(apex, left) || triarea2(apex, right, pl) < 0.0) {
        left = pl;
        leftIndex = i;
      } else {
        pts.push(right);
        apex = right;
        apexIndex = rightIndex;
        left = apex; right = apex;
        leftIndex = apexIndex; rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
  }

  if (pts.length === 0 || !vequal(pts[pts.length - 1], portals[portals.length - 1].left)) {
    pts.push(portals[portals.length - 1].left);
  }
  return pts;
}

// Corridor → portal list → string-pulled world-space path (start omitted).
function corridorToPath(
  corridor: ZoneNode[],
  funnelStart: Pt,
  funnelEnd: Pt,
  vertices: THREE.Vector3[],
): THREE.Vector3[] {
  const portals: Portal[] = [{ left: funnelStart, right: funnelStart }];
  for (let i = 0; i < corridor.length - 1; i++) {
    const a = corridor[i];
    const next = corridor[i + 1];
    for (let j = 0; j < a.neighbours.length; j++) {
      if (a.neighbours[j] === next.id) {
        const p = a.portals[j];
        portals.push({ left: vertices[p[0]], right: vertices[p[1]] });
        break;
      }
    }
  }
  portals.push({ left: funnelEnd, right: funnelEnd });
  const path = stringPull(portals).map((c) => new THREE.Vector3(c.x, c.y, c.z));
  path.shift(); // match findPath: the caller already knows its start position
  return path;
}

/**
 * Same contract as `pathfinding.findPath(start, target, zoneID, groupID)`:
 * returns world-space waypoints with the start position omitted, or null when
 * either endpoint has no containing polygon (callers fall back to centroids).
 */
export function findPathWeighted(
  pathfinding: Pathfinding,
  startPosition: THREE.Vector3,
  targetPosition: THREE.Vector3,
  zoneID: string,
  groupID: number,
): THREE.Vector3[] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zone: ZoneData | undefined = (pathfinding as any).zones?.[zoneID];
  const nodes = zone?.groups?.[groupID];
  if (!nodes) return null;

  const startNode = pathfinding.getClosestNode(startPosition, zoneID, groupID, true) as ZoneNode | null;
  const endNode = pathfinding.getClosestNode(targetPosition, zoneID, groupID, true) as ZoneNode | null;
  if (!startNode || !endNode) return null;

  const corridor = searchCorridor(nodes, startNode, endNode);
  if (!corridor.length) return null;

  return corridorToPath(corridor, startPosition, targetPosition, zone!.vertices);
}

/**
 * Batch variant: routes from ONE start to MANY targets with a single graph
 * search (Dijkstra — A* without a heuristic settles nodes in shortest-distance
 * order, so one pass yields the optimal corridor to EVERY target). Used by the
 * Directions sheet: measuring N destinations costs ~one findPathWeighted call
 * instead of N.
 *
 * Endpoint semantics are the batch mirror of the single version + its callers'
 * fallback: an off-mesh start falls back to the nearest node's centroid
 * internally, and every route ends at the target's nearest-node CENTROID
 * (exactly what computePath passes as the funnel end). Per-target result is
 * null only when that target's node is unreachable from the start's island.
 */
export function findPathsWeighted(
  pathfinding: Pathfinding,
  startPosition: THREE.Vector3,
  targetPositions: THREE.Vector3[],
  zoneID: string,
  groupID: number,
): (THREE.Vector3[] | null)[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zone: ZoneData | undefined = (pathfinding as any).zones?.[zoneID];
  const nodes = zone?.groups?.[groupID];
  if (!nodes || !nodes.length) return targetPositions.map(() => null);

  const startIn = pathfinding.getClosestNode(startPosition, zoneID, groupID, true) as ZoneNode | null;
  const startNode = startIn ?? (pathfinding.getClosestNode(startPosition, zoneID, groupID) as ZoneNode | null);
  if (!startNode) return targetPositions.map(() => null);
  // Funnel from the player's true position only when it's actually on-mesh;
  // otherwise from the fallback node's centroid (same as the callers' retry).
  const funnelStart = startIn ? startPosition : startNode.centroid;

  // Nearest node WITHOUT the polygon-containment check — exactly what
  // computePath resolves as its targetNode before calling the single version,
  // so batch and single measures agree on the endpoint.
  const targetNodes = targetPositions.map(
    (t) => pathfinding.getClosestNode(t, zoneID, groupID) as ZoneNode | null,
  );

  // ── Dijkstra with early exit once every target node is settled ──────────
  const remaining = new Set<number>();
  for (const n of targetNodes) if (n) remaining.add(n.id);

  const g = new Map<number, number>();
  const parent = new Map<number, ZoneNode>();
  const closed = new Set<number>();
  const heap = new MinHeap();

  g.set(startNode.id, 0);
  heap.push(startNode, 0);

  while (heap.size > 0 && remaining.size > 0) {
    const cur = heap.pop();
    if (closed.has(cur.id)) continue; // stale lazy-deletion entry
    closed.add(cur.id);
    remaining.delete(cur.id);

    const gCur = g.get(cur.id)!;
    for (const ni of cur.neighbours) {
      const nb = nodes[ni];
      if (closed.has(nb.id)) continue;
      const tentative = gCur + dist(cur.centroid, nb.centroid);
      const known = g.get(nb.id);
      if (known === undefined || tentative < known) {
        g.set(nb.id, tentative);
        parent.set(nb.id, cur);
        heap.push(nb, tentative);
      }
    }
  }

  // ── Per-target: corridor from the shortest-path tree → funnel ───────────
  return targetNodes.map((endNode) => {
    if (!endNode || !closed.has(endNode.id)) return null; // off-island
    const corridor: ZoneNode[] = [];
    for (let n: ZoneNode | undefined = endNode; n; n = parent.get(n.id)) corridor.push(n);
    corridor.reverse();
    if (corridor[0] !== startNode) return null; // orphaned parent chain (shouldn't happen)
    return corridorToPath(corridor, funnelStart, endNode.centroid, zone!.vertices);
  });
}
