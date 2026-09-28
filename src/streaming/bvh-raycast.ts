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
    if (!geo.attributes.position?.array) return;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.boundingSphere) return;
    _sphere.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(_sphere)) return;
    geo.boundsTree = new MeshBVH(geo);
  }
  acceleratedRaycast.call(this, raycaster, intersects);
}

export function dropBoundsTree(geometry: THREE.BufferGeometry) {
  delete (geometry as BvhGeometry).boundsTree;
}
