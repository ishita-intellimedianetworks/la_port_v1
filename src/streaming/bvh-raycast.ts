import * as THREE from "three";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

type BvhGeometry = THREE.BufferGeometry & { boundsTree?: MeshBVH };

const _sphere = new THREE.Sphere();

export function lazyBvhRaycast(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
) {
  const geo = this.geometry as BvhGeometry;
  if (!geo.boundsTree) {
    // `.array` too: under `freeCpuArrays` the attribute survives with its array
    // nulled, and `new MeshBVH(geo)` would throw on every ray reaching it.
    if (!geo.attributes.position?.array) return;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    _sphere.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(_sphere)) return;
    geo.boundsTree = new MeshBVH(geo);
  }
  acceleratedRaycast.call(this, raycaster, intersects);
}

/** `geometry.dispose()` frees GPU buffers but not the tree, which is plain JS memory. */
export function dropBoundsTree(geometry: THREE.BufferGeometry) {
  delete (geometry as BvhGeometry).boundsTree;
}
