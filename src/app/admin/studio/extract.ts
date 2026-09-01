"use client";

/**
 * Read the world transform of every node in a GLB — the `/extract-pos` job,
 * done inside the studio so the numbers can be assigned to layouts and
 * hotspots without a round trip through the clipboard.
 *
 * That round trip is the workflow this replaces, and it is where the site's
 * cameras came from: open `/extract-pos`, upload `la-port-zone-c5-cp-v3.glb`,
 * copy the `cp_011` block, paste it into `site.json`, remember that the tool
 * prints XYZ while `cameras.*` stores YXZ, and re-derive by hand. Every
 * `_note` in the cameras block is a record of someone doing that carefully.
 *
 * TWO THINGS MUST BE RIGHT and both are easy to get wrong by hand:
 *
 *   updateMatrixWorld  glTF nodes are nested — cameras under rigs, layout
 *                      helpers under floor groups. Reading `node.position`
 *                      gives the LOCAL transform, which for a parented node is
 *                      not where it is. One full world-matrix pass first.
 *
 *   XYZ euler order    the order the rest of this pipeline expects for
 *                      `layouts[].camera.rotation`, `hotspots[].rotation` and
 *                      the input side of `poseForCamera`. Decomposing in any
 *                      other order produces a triple that is correct in
 *                      isolation and wrong everywhere it is used.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Vec3 } from "@/config/schema";
import { roundVec } from "./pose";

export type ExtractedNode = {
  name: string;
  /** `Mesh`, `Group`, `PerspectiveCamera`, `Object3D`… — the three.js type,
   *  which is how a camera helper is told from a piece of geometry. */
  type: string;
  position: Vec3;
  /** XYZ euler, radians. */
  rotation: Vec3;
  /** True for the node types a GLB uses to carry a camera. The import step
   *  defaults to selecting these, since a cp file is usually nothing else. */
  isCamera: boolean;
};

/** Free the geometry the extraction loaded. Nothing is rendered from it — the
 *  file is opened purely to read transforms — so holding any of it is waste. */
function dispose(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material?.dispose();
    }
  });
}

let _loader: GLTFLoader | null = null;
function loader(): GLTFLoader {
  if (!_loader) {
    _loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
  }
  return _loader;
}

/** Every named node in `file`, with its WORLD transform. */
export async function extractNodes(file: File | string): Promise<ExtractedNode[]> {
  const url = typeof file === "string" ? file : URL.createObjectURL(file);
  try {
    const gltf = await loader().loadAsync(url);
    // Once, before anything is read. See the header note.
    gltf.scene.updateMatrixWorld(true);

    const nodes: ExtractedNode[] = [];
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldEuler = new THREE.Euler();

    gltf.scene.traverse((node) => {
      node.getWorldPosition(worldPosition);
      node.getWorldQuaternion(worldQuaternion);
      worldEuler.setFromQuaternion(worldQuaternion, "XYZ");
      nodes.push({
        name: node.name || "(unnamed)",
        type: node.type,
        position: roundVec(worldPosition.toArray()),
        rotation: roundVec([worldEuler.x, worldEuler.y, worldEuler.z]),
        isCamera: node.type === "PerspectiveCamera" || node.type === "OrthographicCamera",
      });
    });

    dispose(gltf.scene);
    return nodes;
  } finally {
    if (typeof file !== "string") URL.revokeObjectURL(url);
  }
}

/**
 * Sort `cp_001`, `cp_002`, … into numeric order, everything else after, by
 * name.
 *
 * glTF preserves authoring order, which is whatever 3ds Max happened to write
 * — so `cp_010` lands between `cp_001` and `cp_002` under a plain string sort,
 * and a bulk "map these ten cameras onto L01–L10 in order" quietly assigns the
 * wrong pose to eight of them. The numeric suffix is the author's own
 * numbering; honouring it is what makes the bulk mapping trustworthy.
 */
export function sortByTrailingNumber(nodes: ExtractedNode[]): ExtractedNode[] {
  const suffix = (name: string) => {
    const match = /(\d+)\s*$/.exec(name);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  return [...nodes].sort((a, b) => {
    const delta = suffix(a.name) - suffix(b.name);
    return delta !== 0 && Number.isFinite(delta) ? delta : a.name.localeCompare(b.name);
  });
}
