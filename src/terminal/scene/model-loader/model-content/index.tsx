"use client";

import { useEffect, useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Bvh } from "@react-three/drei";
import * as THREE from "three";
import { patchMeshForReveal } from "@/shared/ui/screens/loading-screen/reveal";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";
import isLowPower, { acquireGLTF, releaseGLTF } from "@/shared/runtime";
import { softenModelEdges } from "../edge-feather";

export interface SingleModelProps {
  onLoaded?: () => void;
  onBounds?: (bbox: THREE.Box3) => void;
  url: string;
  sharedUniforms?: SharedUniforms;
  /** When false, scene is mounted into R3F's tree but not rendered. Used for
   *  invisible "material library" GLBs (e.g. unit unfurnished textures). */
  visible?: boolean;
  scale?: number | [number, number, number];
  interior?: boolean;
}

export function SingleModelContent({
  onLoaded,
  onBounds,
  url,
  sharedUniforms,
  visible = true,
  scale,
  interior = false,
}: SingleModelProps) {
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, scene);
  const { gl, camera, scene: rootScene } = useThree();

  useEffect(() => {
    if (!visible || !scene) return;
    let cancelled = false;
    (async () => {
      try {
        await gl.compileAsync(scene, camera, rootScene);
        if (cancelled) return;
        if (isLowPower()) return;
        scene.traverse((obj: THREE.Object3D) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            for (const val of Object.values(m)) {
              const tex = val as THREE.Texture;
              if (!tex?.isTexture) continue;
              gl.initTexture(tex);
              try {
                const img = tex.image as unknown;
                if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
                  img.close();
                }
              } catch { /* best-effort — keeping the bitmap is only a memory cost */ }
            }
          }
        });
      } catch {
        /* warm-up is best-effort — worst case is the old lazy compile */
      }
    })();
    return () => { cancelled = true; };
  }, [gl, camera, rootScene, scene, visible]);

  // Autoplay every baked clip on a forever loop while a visible model is
  // mounted. Invisible helper GLBs are skipped.
  useEffect(() => {
    if (!visible || !animations.length) return;

    const playing = Object.values(actions).filter(
      (a): a is NonNullable<typeof a> => !!a,
    );

    for (const action of playing) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    }

    return () => {
      for (const action of playing) action.stop();
    };
  }, [actions, animations, visible]);

  useLayoutEffect(() => {
    if (!scene) return;

    if (sharedUniforms) {
      patchMeshForReveal(scene, sharedUniforms);
    }

    scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Interior models load with their authored materials untouched — skip the
      // refraction-drop tweak (no extra material changes inside a room).
      if (interior || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const pm = mat as THREE.MeshPhysicalMaterial;
        if (typeof pm.transmission === "number" && pm.transmission > 0) {
          pm.transmission = 0;
          pm.needsUpdate = true;
        }
      }
    });

    if (onBounds) {
      const bbox = new THREE.Box3();

      scene.updateWorldMatrix(true, true);

      scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;

        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.computeBoundingBox();

          if (mesh.geometry.boundingBox) {
            bbox.union(
              mesh.geometry.boundingBox
                .clone()
                .applyMatrix4(mesh.matrixWorld)
            );
          }
        }
      });

      if (!bbox.isEmpty()) {
        onBounds(bbox);
        if (visible && !interior) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          softenModelEdges(scene, center, size.x * 0.5, size.z * 0.5);
        }
      }
    }

    onLoaded?.();
  }, [scene, sharedUniforms, onBounds, onLoaded, visible, interior]);

  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  const scaleProp: [number, number, number] | undefined =
    typeof scale === "number" ? [scale, scale, scale] :
    Array.isArray(scale)      ? scale :
    undefined;

  return (
    <Bvh firstHitOnly={false}>
      <primitive object={scene} visible={visible} scale={scaleProp} />
    </Bvh>
  );
}