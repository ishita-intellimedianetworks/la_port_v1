import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

/**
 * Lazily-accelerated raycasting for streamed chunk meshes.
 *
 * Everything in this app that picks the world raycasts `scene.children`:
 * double-click walk-to, the interior portals, and the route ribbon's per-frame
 * ground probe. With one GLB that was cheap because the whole model sat under
 * drei's `<Bvh>`, which builds a bounds tree once at mount. Chunks can't do
 * that — a few hundred of them mount and unmount continuously, and building a
 * tree for every one as it lands would spend more time in `MeshBVH` than in
 * rendering.
 *
 * So the tree is built by the first ray that actually reaches the mesh. The
 * bounding-sphere test comes FIRST and costs nothing: a camera ray crosses a
 * handful of the resident chunks, not all of them, and only those few ever pay
 * for a tree. The tree then lives on the geometry, which `ChunkManager` keeps
 * in its CPU cache across unmount/remount, so a chunk pays at most once per
 * download.
 */

type BvhGeometry = THREE.BufferGeometry & { boundsTree?: MeshBVH };

const _sphere = new THREE.Sphere();

export function lazyBvhRaycast(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
) {
  const geo = this.geometry as BvhGeometry;
  if (!geo.boundsTree) {
    if (!geo.attributes.position) return;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    _sphere.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(_sphere)) return;
    geo.boundsTree = new MeshBVH(geo);
  }
  acceleratedRaycast.call(this, raycaster, intersects);
}

/** Drop a chunk geometry's bounds tree. `geometry.dispose()` frees the GPU
 *  buffers but knows nothing about the tree, which is plain JS memory. */
export function dropBoundsTree(geometry: THREE.BufferGeometry) {
  delete (geometry as BvhGeometry).boundsTree;
}
